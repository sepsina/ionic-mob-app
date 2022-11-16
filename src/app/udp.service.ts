/* eslint-disable object-shorthand */
/* eslint-disable @typescript-eslint/member-ordering */

import { Injectable } from '@angular/core';
import { EventsService } from './events.service';
//import { UtilsService } from './utils.service';
import { Platform } from '@ionic/angular';

import * as gConst from './gConst';
import * as gIF from './gIF';

import { UDP } from '@frontall/capacitor-udp';
import { decode, encode } from 'base64-arraybuffer';

const LOC_PORT = 22802;

@Injectable({
    providedIn: 'root',
})
export class UdpService {

    public udpSocket: number;

    private msgBuf = new ArrayBuffer(1024);
    private msg: DataView = new DataView(this.msgBuf);

    ipSet = new Set();

    test = 10;

    bcAddr = '';

    rdCmd: gIF.rdCmd_t = {
        ip: [],
        busy: false,
        tmoRef: null,
        cmdID: 0,
        idx: 0,
        retryCnt: gConst.RD_CMD_RETRY_CNT,
    };

    constructor(private events: EventsService,
                private platform: Platform) {
        // ---
    }

    /***********************************************************************************************
     * fn          initSocket
     *
     * brief
     *
     */
    async initSocket() {

        this.udpSocket = -1;

        try {
            //await UDP.closeAllSockets();
            const info = await UDP.create();
            this.udpSocket = info.socketId;
            const test = await UDP.bind({
                socketId: info.socketId,
                address: info.ipv4,
                port: LOC_PORT
            });
            console.log(test);
            await UDP.setBroadcast({
                socketId: info.socketId,
                enabled: true
            });
            await UDP.setPaused({
                socketId: info.socketId,
                paused: false
            });
            UDP.addListener('receive', (msg)=>{
                if(msg.socketId === this.udpSocket) {
                    this.udpOnMsg(msg);
                }
            });
            this.events.publish('socketStatus', true);
        }
        catch(err) {
            console.log(err);
        }
    }

    /***********************************************************************************************
     * fn          closeSocket
     *
     * brief
     *
     */
     public async closeSocket() {
        try {
            await UDP.close({
                socketId: this.udpSocket
            });
        }
        catch(err) {
            console.log(err);
        }
    }

    /***********************************************************************************************
     * fn          udpOnMsg
     *
     * brief
     *
     */
    public udpOnMsg(msg: any) {
        const cmdView = new DataView(decode(msg.buffer));
        let cmdIdx = 0;
        const pktFunc = cmdView.getUint16(cmdIdx, gConst.LE);
        cmdIdx += 2;
        switch(pktFunc) {
            case gConst.BRIDGE_ID_RSP: {
                this.ipSet.add(msg.remoteAddress);
                break;
            }
            case gConst.ON_OFF_ACTUATORS: {
                const startIdx = cmdView.getUint16(cmdIdx, gConst.LE);
                cmdIdx += 2;
                const numItems = cmdView.getUint16(cmdIdx, gConst.LE);
                cmdIdx += 2;
                const doneFlag = cmdView.getInt8(cmdIdx);
                cmdIdx++;
                for(let i = 0; i < numItems; i++) {
                    const item = {} as gIF.onOffItem_t;
                    item.hostIP = msg.remoteAddress;
                    item.type = gConst.ACTUATOR_ON_OFF;
                    item.partNum = cmdView.getUint32(cmdIdx, gConst.LE);
                    cmdIdx += 4;
                    item.extAddr = cmdView.getFloat64(cmdIdx, gConst.LE);
                    cmdIdx += 8;
                    item.endPoint = cmdView.getUint8(cmdIdx);
                    cmdIdx++;
                    item.state = cmdView.getUint8(cmdIdx);
                    cmdIdx++;
                    item.level = cmdView.getUint8(cmdIdx);
                    cmdIdx++;
                    const nameLen = cmdView.getUint8(cmdIdx);
                    cmdIdx++;
                    const name = [];
                    for(let k = 0; k < nameLen; k++) {
                        name.push(cmdView.getUint8(cmdIdx));
                        cmdIdx++;
                    }
                    item.name = String.fromCharCode.apply(String, name);

                    const key = this.itemKey(item.extAddr, item.endPoint);
                    this.events.publish('newItem', {key: key, value: item});
                }
                clearTimeout(this.rdCmd.tmoRef);
                if(doneFlag === 1) {
                    this.rdCmd.ip.shift();
                    if(this.rdCmd.ip.length > 0) {
                        this.rdCmd.idx = 0;
                        this.rdCmd.retryCnt = gConst.RD_CMD_RETRY_CNT;
                        this.getItems(this.rdCmd.ip[0], this.rdCmd.idx);
                        this.rdCmd.tmoRef = setTimeout(()=>{
                            this.rdCmdTmo();
                        }, gConst.RD_CMD_TMO);
                    }
                    else {
                        this.rdCmd.busy = false;
                    }
                }
                if(doneFlag === 0) {
                    this.rdCmd.idx = startIdx + numItems;
                    this.rdCmd.retryCnt = gConst.RD_CMD_RETRY_CNT;
                    this.getItems(this.rdCmd.ip[0], this.rdCmd.idx);
                    this.rdCmd.tmoRef = setTimeout(()=>{
                        this.rdCmdTmo();
                    }, gConst.RD_CMD_TMO);
                }
                break;
            }
            case gConst.BAT_VOLTS:
            case gConst.P_ATM_SENSORS:
            case gConst.RH_SENSORS:
            case gConst.T_SENSORS: {
                const startIdx = cmdView.getUint16(cmdIdx, gConst.LE);
                cmdIdx += 2;
                const numItems = cmdView.getUint16(cmdIdx, gConst.LE);
                cmdIdx += 2;
                const doneFlag = cmdView.getInt8(cmdIdx);
                cmdIdx++;
                for(let i = 0; i < numItems; i++) {
                    let val: number;
                    let units: number;
                    const item = {} as gIF.sensorItem_t;
                    item.hostIP = msg.remoteAddress;
                    item.type = gConst.SENSOR;
                    item.partNum = cmdView.getUint32(cmdIdx, gConst.LE);
                    cmdIdx += 4;
                    item.extAddr = cmdView.getFloat64(cmdIdx, gConst.LE);
                    cmdIdx += 8;
                    item.endPoint = cmdView.getUint8(cmdIdx);
                    cmdIdx++;
                    switch(pktFunc) {
                        case gConst.T_SENSORS: {
                            val = cmdView.getInt16(cmdIdx, gConst.LE);
                            cmdIdx += 2;
                            val = val / 10.0;
                            units = cmdView.getUint16(cmdIdx, gConst.LE);
                            cmdIdx += 2;
                            if(units === gConst.DEG_F) {
                                item.formatedVal = `${val.toFixed(1)} °F`;
                            }
                            else {
                                item.formatedVal = `${val.toFixed(1)} °C`;
                            }
                            break;
                        }
                        case gConst.RH_SENSORS: {
                            val = cmdView.getUint16(cmdIdx, gConst.LE);
                            cmdIdx += 2;
                            val = Math.round(val / 10.0);
                            item.formatedVal = `${val.toFixed(0)} %rh`;
                            break;
                        }
                        case gConst.P_ATM_SENSORS: {
                            val = cmdView.getUint16(cmdIdx, gConst.LE);
                            cmdIdx += 2;
                            val = val / 10.0;
                            units = cmdView.getUint16(cmdIdx, gConst.LE);
                            cmdIdx += 2;
                            if(units === gConst.IN_HG) {
                                item.formatedVal = `${val.toFixed(1)} inHg`;
                            }
                            else {
                                val = Math.round(val);
                                item.formatedVal = `${val.toFixed(1)} mBar`;
                            }
                            break;
                        }
                        case gConst.BAT_VOLTS: {
                            val = cmdView.getUint16(cmdIdx, gConst.LE);
                            cmdIdx += 2;
                            val = val / 10.0;
                            item.formatedVal = `${val.toFixed(1)} V`;
                            break;
                        }
                    }
                    const nameLen = cmdView.getUint8(cmdIdx);
                    cmdIdx++;
                    const name = [];
                    for(let k = 0; k < nameLen; k++) {
                        name.push(cmdView.getUint8(cmdIdx));
                        cmdIdx++;
                    }
                    item.name = String.fromCharCode.apply(String, name);

                    const key = this.itemKey(item.extAddr, item.endPoint);
                    this.events.publish('newItem', {key: key, value: item});
                }
                clearTimeout(this.rdCmd.tmoRef);
                if(doneFlag === 1) {
                    this.rdCmd.ip.shift();
                    if(this.rdCmd.ip.length > 0) {
                        this.rdCmd.idx = 0;
                        this.rdCmd.retryCnt = gConst.RD_CMD_RETRY_CNT;
                        this.getItems(this.rdCmd.ip[0], this.rdCmd.idx);
                        this.rdCmd.tmoRef = setTimeout(()=>{
                            this.rdCmdTmo();
                        }, gConst.RD_CMD_TMO);
                    }
                    else {
                        this.rdCmd.busy = false;
                    }
                }
                if(doneFlag === 0) {
                    this.rdCmd.idx = startIdx + numItems;
                    this.rdCmd.retryCnt = gConst.RD_CMD_RETRY_CNT;
                    this.getItems(this.rdCmd.ip[0], this.rdCmd.idx);
                    this.rdCmd.tmoRef = setTimeout(()=>{
                        this.rdCmdTmo();
                    }, gConst.RD_CMD_TMO);
                }
                break;
            }
            default:
                // ---
                break;
        }
    }

    /***********************************************************************************************
     * fn          startRead
     *
     * brief
     *
     */
    public async startRead(cmdID: number) {

        let idx = 0;
        this.msg.setUint16(idx, gConst.BRIDGE_ID_REQ, gConst.LE);
        idx += 2;
        const len = idx;
        await UDP.send({
            socketId: this.udpSocket,
            address: this.bcAddr, //'192.168.1.255',
            port: gConst.UDP_PORT,
            buffer: encode(this.msgBuf.slice(0, len))
        });

        this.ipSet.clear();
        this.rdCmd.cmdID = cmdID;
        setTimeout(()=>{
            this.readItems();
        }, 500);
    }

    /***********************************************************************************************
     * fn          readItems
     *
     * brief
     *
     */
    public readItems() {

        if(this.ipSet.size === 0) {
            return;
        }
        this.rdCmd.busy = true;
        this.rdCmd.ip = [...this.ipSet];
        this.rdCmd.idx = 0;
        this.rdCmd.retryCnt = gConst.RD_CMD_RETRY_CNT;
        this.rdCmd.tmoRef = setTimeout(()=>{
            this.rdCmdTmo();
        }, gConst.RD_CMD_TMO);

        this.getItems(this.rdCmd.ip[0], this.rdCmd.idx);
    }

    /***********************************************************************************************
     * fn          getItems
     *
     * brief
     *
     */
    public async getItems(ip: string, idx: number) {

        let msgIdx = 0;
        this.msg.setUint16(msgIdx, this.rdCmd.cmdID, gConst.LE);
        msgIdx += 2;
        this.msg.setUint16(msgIdx, idx, gConst.LE);
        msgIdx += 2;
        const len = msgIdx;
        await UDP.send({
            socketId: this.udpSocket,
            address: ip,
            port: gConst.UDP_PORT,
            buffer: encode(this.msgBuf.slice(0, len))
        });
    }

    /***********************************************************************************************
     * fn          rdCmdTmo
     *
     * brief
     *
     */
    rdCmdTmo() {

        console.log('--- READ_CMD_TMO ---');

        if(this.rdCmd.ip.length === 0) {
            this.rdCmd.busy = false;
            return;
        }
        if(this.rdCmd.retryCnt > 0) {
            this.rdCmd.retryCnt--;
            this.getItems(this.rdCmd.ip[0], this.rdCmd.idx);
            this.rdCmd.tmoRef = setTimeout(()=>{
                this.rdCmdTmo();
            }, gConst.RD_HOST_TMO);
        }
        if(this.rdCmd.retryCnt === 0) {
            this.rdCmd.ip.shift();
            if(this.rdCmd.ip.length > 0) {
                this.rdCmd.idx = 0;
                this.rdCmd.retryCnt = gConst.RD_CMD_RETRY_CNT;
                this.getItems(this.rdCmd.ip[0], this.rdCmd.idx);
                this.rdCmd.tmoRef = setTimeout(()=>{
                    this.rdCmdTmo();
                }, gConst.RD_CMD_TMO);
            }
            else {
                this.rdCmd.busy = false;
            }
        }
    }

    /***********************************************************************************************
     * fn          itemKey
     *
     * brief
     *
     */
    private itemKey(extAddr: number, endPoint: number) {

        const len = 8 + 1;
        const ab = new ArrayBuffer(len);
        const dv = new DataView(ab);
        let i = 0;
        dv.setFloat64(i, extAddr, gConst.LE);
        i += 8;
        dv.setUint8(i++, endPoint);
        const key = [];
        for (let j = 0; j < len; j++) {
            key[j] = dv.getUint8(j).toString(16);
        }
        return `item-${key.join('')}`;

        /*
        let key = `item-${shortAddr.toString(16).padStart(4, '0').toUpperCase()}`;
        key += `:${endPoint.toString(16).padStart(2, '0').toUpperCase()}`;

        return key;
        */
    }

    /***********************************************************************************************
     * fn          getItems
     *
     * brief
     *
     */
     public async udpSend(ip: string, msg: ArrayBuffer) {

        await UDP.send({
            socketId: this.udpSocket,
            address: ip,
            port: gConst.UDP_PORT,
            buffer: encode(msg)
        });
    }
}
