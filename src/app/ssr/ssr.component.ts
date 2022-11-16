/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable @angular-eslint/component-selector */
import { Component, OnInit, Input } from '@angular/core';
import { UdpService } from '../udp.service';
import { UtilsService } from '../utils.service';

import { UDP } from '@frontall/capacitor-udp';

import * as gConst from '../gConst';
import * as gIF from '../gIF';

const OFF = 0;
const ON = 1;
const TOGGLE = 2;
const LEVEL = 3;

@Component({
    selector: 'ssr',
    templateUrl: './ssr.component.html',
    styleUrls: ['./ssr.component.scss']
})
export class ssrComponent implements OnInit {

    @Input() onOff: gIF.onOffItem_t;

    private msgBuf = new ArrayBuffer(1024);
    private msg: DataView = new DataView(this.msgBuf);

    hasLevel = true;
    sliderVal = 100;

    constructor(private udp: UdpService,
                private utils: UtilsService) {
        //---
    }

    /***********************************************************************************************
     * @fn          ngOnInit
     *
     * @brief
     *
     */
    ngOnInit(): void {
        if(this.onOff.level === 0xFF){
            this.hasLevel = false;
        }
        else {
            this.hasLevel = true;
            this.sliderVal = this.onOff.level;
        }
    }

    /***********************************************************************************************
     * @fn          sliderChanged
     *
     * @brief
     *
     */
    sliderChanged(): void {
        // ---
    }

    /***********************************************************************************************
     * @fn          getName
     *
     * @brief
     *
     */
    getName(){
        return `${this.onOff.name}`;
    }

    /***********************************************************************************************
     * @fn          setActuatorOn
     *
     * @brief
     *
     */
    setActuatorOn(){
        if(this.hasLevel){
            this.setActuatorLevel();
        }
        else {
            this.setActuator(ON);
        }
    }

    /***********************************************************************************************
     * @fn          setActuatorOff
     *
     * @brief
     *
     */
    setActuatorOff(){
        this.setActuator(OFF);
    }

    /***********************************************************************************************
     * @fn          toggleActuator
     *
     * @brief
     *
     */
    toggleActuator(){
        this.setActuator(TOGGLE);
    }

    /***********************************************************************************************
     * @fn          setActuatorLevel
     *
     * @brief
     *
     */
    setActuatorLevel(){
        this.setActuator(LEVEL);
    }

    /***********************************************************************************************
     * @fn          setActuator
     *
     * @brief
     *
     */
    async setActuator(state: number){

        if(this.udp.rdCmd.busy === true){
            return;
        }
        let idx = 0;
        this.msg.setUint16(idx, gConst.UDP_ZCL_CMD, gConst.LE);
        idx += 2;
        this.msg.setFloat64(idx, this.onOff.extAddr, gConst.LE);
        idx += 8;
        this.msg.setUint8(idx, this.onOff.endPoint);
        idx++;
        this.msg.setUint16(idx, gConst.CLUSTER_ID_GEN_ON_OFF, gConst.LE);
        idx += 2;
        this.msg.setUint8(idx, 0); // hasRsp -> no
        idx++;
        const cmdLenIdx = idx;
        this.msg.setUint8(idx, 0); // cmdLen -> placeholder
        idx++;
        let cmdLen = idx;
        this.msg.setUint8(idx, 0x11); // cluster spec cmd, not manu spec, client to srv dir, disable dflt rsp
        idx++;
        this.msg.setUint8(idx, 0); // seq num -> not used
        idx++;
        switch(state) {
            case OFF: {
                this.msg.setUint8(idx, OFF); // ON_OFF cluster cmd OFF
                idx++;
                break;
            }
            case ON: {
                this.msg.setUint8(idx, ON); // ON_OFF cluster cmd ON
                idx++;
                break;
            }
            case TOGGLE: {
                this.msg.setUint8(idx, TOGGLE); // ON_OFF cluster cmd TOGGLE
                idx++;
                break;
            }
            case LEVEL: {
                this.msg.setUint8(idx, LEVEL); // 'extended' ON_OFF cluster cmd TOGGLE
                idx++;
                this.msg.setUint8(idx, this.sliderVal);
                idx++;
                break;
            }
        }
        cmdLen = idx - cmdLen;
        this.msg.setUint8(cmdLenIdx, cmdLen); // now cmdLen gets right value
        const msgLen = idx;
        const bufData = this.msgBuf.slice(0, msgLen);

        await this.udp.udpSend(this.onOff.hostIP, bufData);
    }

}
