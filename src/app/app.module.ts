
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';

import { IonicModule } from '@ionic/angular';

import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { AngularMaterialModule } from './angular-material/angular-material.module';

import { AppComponent } from './app.component';
import { ssrComponent } from './ssr/ssr.component';
import { sensorComponent } from './sensor/sensor.component';
import { ResizeObserverDirective } from './directives/resize-observer.directive';

import { NetworkInterface } from '@ionic-native/network-interface/ngx';


@NgModule({
    declarations: [
        AppComponent,
        ssrComponent,
        sensorComponent,
        ResizeObserverDirective
    ],
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        BrowserModule,
        IonicModule.forRoot(),
        BrowserAnimationsModule,
        AngularMaterialModule,
    ],
    providers: [
        NetworkInterface
    ],
    bootstrap: [
        AppComponent
    ]
})
export class AppModule {
}
