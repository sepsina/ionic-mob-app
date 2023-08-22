/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable @angular-eslint/component-selector */
import { Component, OnInit, Input, NgZone } from '@angular/core';
import { UdpService } from '../udp.service';
import { UtilsService } from '../utils.service';

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

    rwBuf = new gIF.rwBuf_t();

    constructor(private udp: UdpService,
                private utils: UtilsService,
                private ngZone: NgZone) {
        this.rwBuf.wrView = this.msg;
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
        this.udp.seqNum = ++this.udp.seqNum % 256;

        this.rwBuf.wrIdx = 0;
        this.rwBuf.write_uint16_LE(gConst.SL_MSG_ZCL_CMD);
        const lenIdx = this.rwBuf.wrIdx;
        this.rwBuf.write_uint8(0);
        // cmd data
        const dataStartIdx = this.rwBuf.wrIdx;
        this.rwBuf.write_uint8(this.udp.seqNum);
        this.rwBuf.write_double_LE(this.onOff.extAddr);
        this.rwBuf.write_uint8(this.onOff.endPoint);
        this.rwBuf.write_uint16_LE(gConst.CLUSTER_ID_GEN_ON_OFF);
        this.rwBuf.write_uint8(0); // hasRsp -> no
        const cmdLenIdx = this.rwBuf.wrIdx;
        this.rwBuf.write_uint8(0); // cmdLen -> placeholder
        const startCmdIdx = this.rwBuf.wrIdx;
        this.rwBuf.write_uint8(0x11); // cluster spec cmd, not manu spec, client to srv dir, disable dflt rsp
        this.rwBuf.write_uint8(0); // seq num -> not used
        switch(state) {
            case OFF: {
                this.rwBuf.write_uint8(OFF); // ON_OFF cluster cmd OFF
                break;
            }
            case ON: {
                this.rwBuf.write_uint8(ON); // ON_OFF cluster cmd ON
                break;
            }
            case TOGGLE: {
                this.rwBuf.write_uint8(TOGGLE); // ON_OFF cluster cmd TOGGLE
                break;
            }
            case LEVEL: {
                this.rwBuf.write_uint8(LEVEL); // 'extended' ON_OFF cluster cmd TOGGLE
                this.rwBuf.write_uint8(this.sliderVal);
                break;
            }
        }
        const msgLen = this.rwBuf.wrIdx;
        const cmdLen = msgLen - startCmdIdx;
        this.rwBuf.modify_uint8(cmdLenIdx, cmdLen); // now cmdLen gets right value
        const dataLen = msgLen - dataStartIdx;
        this.rwBuf.modify_uint8(lenIdx, dataLen);

        this.udp.sendPkt(this.onOff.ip,
                         this.onOff.port,
                         this.msgBuf.slice(0, msgLen));

        this.ngZone.run(()=>{
            this.onOff.busy = true;
        });
        this.onOff.tmo = setTimeout(() => {
            this.onOff.busy = false;
        }, 1000);
    }

}
