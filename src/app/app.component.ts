/* eslint-disable @typescript-eslint/naming-convention */
import { Component, OnInit, OnDestroy, NgZone, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { EventsService } from './events.service';
import { UdpService } from './udp.service';
import { Validators, FormControl } from '@angular/forms';
import { MatSelectChange } from '@angular/material/select';
import { Platform } from '@ionic/angular';
import { NetworkInterface } from '@ionic-native/network-interface/ngx';

import * as gConst from './gConst';
//import * as gIF from './gIF';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy, AfterViewInit{

    @ViewChild('appRef') appRef: ElementRef;

    selTypes = ['on-off actuators', 'temp sensors', 'humidity sensors'];
    typeCtrl = new FormControl(this.selTypes[0], Validators.required);
    selectedType = this.selTypes[0];

    g_const = gConst;

    udpBusy = false;
    socketStatus = false;
    itemsMap = new Map();

    test = 15;

    constructor(public udp: UdpService,
                public platform: Platform,
                public events: EventsService,
                public nwkIF: NetworkInterface,
                public ngZone: NgZone) {
        this.platform.ready().then(()=>{
            console.log(`h: ${platform.height()}, w: ${platform.width()}`);
            setTimeout(()=>{
                this.udp.initSocket();
            }, 100);
        });
    }

    /***********************************************************************************************
     * fn          ngAfterViewInit
     *
     * brief
     *
     */
    ngAfterViewInit(): void {
        // ---
    }

    /***********************************************************************************************
     * fn          ngOnInit
     *
     * brief
     *
     */
    ngOnInit() {

        this.udpBusy = this.udp.rdCmd.busy;
        this.udp.itemsRef = this.itemsMap;

        this.events.subscribe('newItem', (msg)=>{
            this.ngZone.run(()=>{
                this.itemsMap.set(msg.key, msg.value);
            });
        });

        this.events.subscribe('socketStatus', (status: boolean)=>{
            this.socketStatus = status;
            if(status === true){
                this.readSelected();
            }
        });

        window.onbeforeunload = ()=>{
            this.ngOnDestroy();
        };
    }

    /***********************************************************************************************
     * fn          ngOnDestroy
     *
     * brief
     *
     */
    ngOnDestroy() {
        this.udp.closeSocket();
    }

    /***********************************************************************************************
     * @fn          onResize
     *
     * @brief
     *
     */
    onResize(event){
        const rect = event.contentRect;
        console.log(`w: ${rect.width}, h: ${rect.height}`);
        /*
        if(rect.width > 520){
            setTimeout(()=>{
                this.ngZone.run(()=>{
                    const elByID = document.getElementById('app-frame');
                    elByID.style.maxWidth = '500px';
                });
            }, 1000);
        }
        */
    }

    /***********************************************************************************************
     * @fn          selChanged
     *
     * @brief
     *
     */
    selChanged(event: MatSelectChange){

        this.selectedType = event.value;
        this.readSelected();
    }

    /***********************************************************************************************
     * @fn          readSelected
     *
     * @brief
     *
     */
    async readSelected(){

        if(this.udpBusy === true || this.udp.bridges.length === 0){
            return;
        }
        this.itemsMap.clear();

        switch(this.selectedType){
            case 'on-off actuators': {
                this.udp.readItems(gConst.ON_OFF_ACTUATORS);
                break;
            }
            case 'temp sensors': {
                this.udp.readItems(gConst.T_SENSORS);
                break;
            }
            case 'humidity sensors': {
                this.udp.readItems(gConst.RH_SENSORS);
                break;
            }
            default:
                break;
        }
        console.log(`read ${this.selectedType}`);
    }

}
