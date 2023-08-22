/* eslint-disable @typescript-eslint/prefer-for-of */
/* eslint-disable object-shorthand */
/* eslint-disable @typescript-eslint/member-ordering */

import { Injectable, NgZone } from '@angular/core';
import { EventsService } from './events.service';
import { UtilsService } from './utils.service';
import { Platform } from '@ionic/angular';

import * as gConst from './gConst';
import * as gIF from './gIF';

const LOC_PORT = 22802;
const BRIDGE_TTL = 10;

@Injectable({
    providedIn: 'root',
})
export class UdpService {

    socketID: number;
    udpSock = (window as any).chrome.sockets.udp;

    private msgBuf = new ArrayBuffer(1024);
    msg: DataView = new DataView(this.msgBuf);

    bridges: gIF.bridge_t[] = [];
    bridgesFlag = false;

    seqNum = 0;

    rdCmd: gIF.rdCmd_t = {
        ip: [],
        busy: false,
        tmoRef: null,
        cmdID: 0,
        idx: 0,
        retryCnt: gConst.RD_CMD_RETRY_CNT,
    };

    itemsRef: any;

    rwBuf = new gIF.rwBuf_t();

    constructor(private events: EventsService,
                private utils: UtilsService,
                private ngZone: NgZone) {
        this.rwBuf.wrView = this.msg;
        setTimeout(()=>{
            this.cleanAgedBridges();
        }, 1000);
    }

    /***********************************************************************************************
     * fn          initSocket
     *
     * brief
     *
     */
    initSocket() {

        this.udpSock.create((createInfo)=>{
            this.socketID = createInfo.socketId;
            this.udpSock.bind(
                createInfo.socketId,
                '0.0.0.0',
                LOC_PORT,
                (res)=>{
                    if(res >= 0) {
                        this.udpSock.setBroadcast(createInfo.socketId, true);
                        this.udpSock.setPaused(createInfo.socketId, false);
                    }
                }
            );
        });
        this.udpSock.onReceive.addListener((msg) => {
            if(msg.socketId === this.socketID) {
                this.udpOnMsg(msg);
            }
        });
    }

    /***********************************************************************************************
     * fn          closeSocket
     *
     * brief
     *
     */
     public closeSocket() {

        this.udpSock.close(this.socketID);
    }

    /***********************************************************************************************
     * fn          udpOnMsg
     *
     * brief
     *
     */
    public udpOnMsg(msg: any) {

        const cmdView = new DataView(msg.data);
        this.rwBuf.rdView = cmdView;
        this.rwBuf.rdIdx = 0;

        const pktFunc = this.rwBuf.read_uint16_LE();
        switch(pktFunc) {
            case gConst.BRIDGE_ID_RSP: {
                this.addBridge(msg.remoteAddress);
                break;
            }
            case gConst.ON_OFF_ACTUATORS: {
                const startIdx = this.rwBuf.read_uint16_LE();
                const numItems = this.rwBuf.read_uint16_LE();
                const doneFlag = this.rwBuf.read_uint8();
                for(let i = 0; i < numItems; i++) {
                    const item = {} as gIF.onOffItem_t;
                    item.type = gConst.ACTUATOR_ON_OFF;
                    item.partNum = this.rwBuf.read_uint32_LE();
                    item.extAddr = this.rwBuf.read_double_LE();
                    item.endPoint = this.rwBuf.read_uint8();
                    item.state = this.rwBuf.read_uint8();
                    item.level = this.rwBuf.read_uint8();
                    const nameLen = this.rwBuf.read_uint8();
                    const name = [];
                    for(let k = 0; k < nameLen; k++) {
                        name.push(this.rwBuf.read_uint8());
                    }
                    item.name = String.fromCharCode.apply(String, name);
                    item.ip = this.utils.ipFromLong(this.rwBuf.read_uint32_LE());
                    item.port = this.rwBuf.read_uint16_LE();
                    item.busy = false;

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
                const startIdx = this.rwBuf.read_uint16_LE();
                const numItems = this.rwBuf.read_uint16_LE();
                const doneFlag = this.rwBuf.read_uint8();
                for(let i = 0; i < numItems; i++) {
                    const item = {} as gIF.sensorItem_t;
                    item.hostIP = msg.remoteAddress;
                    item.type = gConst.SENSOR;
                    item.partNum = this.rwBuf.read_uint32_LE();
                    item.extAddr = this.rwBuf.read_double_LE();
                    item.endPoint = this.rwBuf.read_uint8();
                    switch(pktFunc) {
                        case gConst.T_SENSORS: {
                            let val = this.rwBuf.read_int16_LE();
                            val = val / 10.0;
                            const units = this.rwBuf.read_uint16_LE();
                            if(units === gConst.DEG_F) {
                                item.formatedVal = `${val.toFixed(1)} °F`;
                            }
                            else {
                                item.formatedVal = `${val.toFixed(1)} °C`;
                            }
                            break;
                        }
                        case gConst.RH_SENSORS: {
                            let val = this.rwBuf.read_uint16_LE();
                            val = Math.round(val / 10.0);
                            item.formatedVal = `${val.toFixed(0)} %rh`;
                            break;
                        }
                        case gConst.P_ATM_SENSORS: {
                            let val = this.rwBuf.read_uint16_LE();
                            val = val / 10.0;
                            const units = this.rwBuf.read_uint16_LE();
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
                            let val = this.rwBuf.read_uint16_LE();
                            val = val / 10.0;
                            item.formatedVal = `${val.toFixed(1)} V`;
                            break;
                        }
                    }
                    const nameLen = this.rwBuf.read_uint8();
                    const name = [];
                    for(let k = 0; k < nameLen; k++) {
                        name.push(this.rwBuf.read_uint8());
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
            case gConst.SL_MSG_ZCL_CMD: {
                const msgSeqNum = this.rwBuf.read_uint8();
                const extAddr = this.rwBuf.read_double_LE();
                const endPoint = this.rwBuf.read_uint8();
                const clusterID = this.rwBuf.read_uint16_LE();
                const status = this.rwBuf.read_uint8();
                if(msgSeqNum === this.seqNum){
                    if(clusterID === gConst.CLUSTER_ID_GEN_ON_OFF){
                        const key = this.itemKey(extAddr, endPoint);
                        const item: gIF.onOffItem_t = this.itemsRef.get(key);
                        if(item){
                            if(status === 0){
                                console.log(`cmd to ${item.name}: success`);
                            }
                            else {
                                console.log(`cmd to ${item.name}: fail`);
                            }
                            clearTimeout(item.tmo);
                            this.ngZone.run(()=>{
                                item.busy = false;
                            });
                        }
                    }
                }
                break;
            }
            default:
                // ---
                break;
        }
    }

    /***********************************************************************************************
     * fn          readItems
     *
     * brief
     *
     */
    public readItems(cmdID: number) {

        if(this.bridges.length === 0){
            return;
        }
        this.rdCmd.cmdID = cmdID;
        this.rdCmd.busy = true;
        this.rdCmd.ip = [];
        for(let i = 0; i < this.bridges.length; i++){
            this.rdCmd.ip.push(this.bridges[i].ip);
        }
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

        this.rwBuf.wrIdx = 0;
        this.rwBuf.write_uint16_LE(this.rdCmd.cmdID);
        this.rwBuf.write_uint16_LE(idx);

        const len = this.rwBuf.wrIdx;
        this.udpSock.send(this.socketID,
                          this.msgBuf.slice(0, len),
                          ip,
                          gConst.UDP_PORT,
                          ()=>{
                              // ---
                          }
        );
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
    }

    /***********************************************************************************************
     * fn          addBridge
     *
     * brief
     *
     */
    private addBridge(ip: string) {

        let newFlag = true;
        let i = this.bridges.length;
        if(i > 0){
            while(i--){
                if(this.bridges[i].ip === ip){
                    this.bridges[i].ttl = BRIDGE_TTL;
                    newFlag = false;
                }
            }
        }
        if(newFlag === true){
            const newBridge = {
                ip: ip,
                ttl: BRIDGE_TTL
            };
            this.bridges.push(newBridge);
        }
        if(this.bridges.length > 0){
            this.bridgesFlag = true;
        }
        else {
            this.bridgesFlag = false;
        }
    }

    /***********************************************************************************************
     * fn          cleanAgedBridges
     *
     * brief
     *
     */
    private cleanAgedBridges() {

        let i = this.bridges.length;
        if(i > 0){
            while(i--){
                if(this.bridges[i].ttl > 0){
                    this.bridges[i].ttl--;
                }
                else {
                    this.bridges.splice(i, 1);
                }
            }
        }
        if(this.bridges.length > 0){
            this.bridgesFlag = true;
        }
        else {
            this.bridgesFlag = false;
        }
        setTimeout(()=>{
            this.cleanAgedBridges();
        }, 1000);
    }

    /***********************************************************************************************
     * fn          sendPkt
     *
     * brief
     *
     */
    public sendPkt(ip: string, port: number, msg: ArrayBuffer) {
        this.udpSock.send(this.socketID, msg, ip, port, ()=>{
            // ---
        });
    }
}
