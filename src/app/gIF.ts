/* eslint-disable @typescript-eslint/naming-convention */

export interface rdCmd_t {
    ip: any;
    busy: boolean;
    tmoRef: any;
    cmdID: number;
    idx: number;
    retryCnt: number;
}

export interface sensorItem_t {
    hostIP: string;
    type: number;
    name: string;
    formatedVal: string;
    partNum: number;
    extAddr: number;
    endPoint: number;
}

export interface onOffItem_t {
    ip: string;
    port: number;
    type: number;
    name: string;
    state: number;
    level: number;
    partNum: number;
    extAddr: number;
    endPoint: number;
    busy: boolean;
    tmo: any;
}

export interface bridge_t {
    ip: string;
    ttl: number;
}

export class rwBuf_t {

    rdIdx: number;
    wrIdx: number;

    rdView: any;
    wrView: any;

    constructor(){

    }

    read_uint8(){
        const val = this.rdView.getUint8(this.rdIdx);
        this.rdIdx += 1;
        return val;
    }

    read_uint16_LE(){
        const val = this.rdView.getUint16(this.rdIdx, true);
        this.rdIdx += 2;
        return val;
    }

    read_int16_LE(){
        const val = this.rdView.getInt16(this.rdIdx, true);
        this.rdIdx += 2;
        return val;
    }

    read_uint32_LE(){
        const val = this.rdView.getUint32(this.rdIdx, true);
        this.rdIdx += 4;
        return val;
    }

    read_double_LE(){
        const val = this.rdView.getFloat64(this.rdIdx, true);
        this.rdIdx += 8;
        return val;
    }

    write_uint8(val: number){
        this.wrView.setUint8(this.wrIdx, val);
        this.wrIdx += 1;
    }

    modify_uint8(idx: number, val: number){
        this.wrView.setUint8(idx, val);
    }

    write_uint16_LE(val: number){
        this.wrView.setUint16(this.wrIdx, val, true);
        this.wrIdx += 2;
    }

    write_int16_LE(val: number){
        this.wrView.setInt16(this.wrIdx, val, true);
        this.wrIdx += 2;
    }

    modify_uint16_LE(idx: number, val: number){
        this.wrView.setUint16(idx, val, true);

    }

    write_uint32_LE(val: number){
        this.wrView.setUint32(this.wrIdx, val, true);
        this.wrIdx += 4;
    }

    write_double_LE(val: number){
        this.wrView.setFloat64(this.wrIdx, val, true);
        this.wrIdx += 8;
    }
}




