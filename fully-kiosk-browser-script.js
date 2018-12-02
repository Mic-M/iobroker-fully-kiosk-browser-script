/*******************************************************************************
 * ---------------------------
 * Script: Steuerung Fully-Browser in ioBroker
 * ---------------------------
 * Quelle: xxx
 * Version: 0.1
 * Autor: Mic
 * Support: xxx
 * Fully Browser REST Interface: https://www.ozerov.de/fully-kiosk-browser/de/#rest
 ******************************************************************************/

/*******************************************************************************
 * Konfiguration: Pfade / Datenpunkte
 ******************************************************************************/
// Datenpunkte: Hauptpfad
const STATE_PATH = 'javascript.'+ instance + '.' + 'mic.FullyBrowser.';

/*******************************************************************************
 * Konfiguration: Fully
 ******************************************************************************/
const FULLY_IP = '10.10.0.456';
const FULLY_PORT = '2323';
const FULLY_PASSWORD = '123test';

/*******************************************************************************
 * Konfiguration: Rest
 ******************************************************************************/

// Wie oft ausführen? 
const FULLY_REQUEST_INFO_SCHEDULE = "*/2 * * * *"; // Alle 2 Minuten

// Logeinträge auf Debug setzen?
const FDEBUG = false;

// Logeinträge auf erweiterte Infos im Log setzen (bei Scriptstart, bei Drücken eines Buttons, etc.)
const EXTINFO = true;


/**********************************************************************************************************
 ++++++++++++++++++++++++++++ Ab hier nichts mehr ändern / Stop editing here! ++++++++++++++++++++++++++++
 *********************************************************************************************************/


/*******************************************************************************
 * Executed on every script start.
 *******************************************************************************/
init();
function init() {
 
    // Create states
    createScriptStates();

    // Main Script starten, 3s nach State-Generierung
    setTimeout(main, 3000);

}

/*******************************************************************************
 * Haupt-Skript
 *******************************************************************************/
var mSchedule;
function main() {

    /***
     * Regelmäßig Infos vom Fully Browser holen.
     * Hierbei zunächst evtl. laufende Schedules zuerst beenden, falls aktiv.
     **/
    clearSchedule(mSchedule);
    mSchedule = schedule(FULLY_REQUEST_INFO_SCHEDULE, getFullyBrowserInfo);
    if (EXTINFO) log('Fully Browser: Schedule zum Abruf der Informationen gestartet (' + FULLY_REQUEST_INFO_SCHEDULE + ')');

    /***
     * Monitor Button Commands
     * All Button Command states being monitored. If button pushed, the command is sent to Fully Browser.
     * Note: the name of the state is the same as the command to be sent.
     **/
    const MSELECTOR_BTN = $('[id=' + STATE_PATH + 'Commands.*][role=button]');
    MSELECTOR_BTN.each(function (stateId, i) {
        on({id: stateId, val:true}, function (obj) {
            fullySendCommand(obj.common.name);
            if (EXTINFO) log('Gesendet: ' + obj.common.name);
            setState(obj.id, false);
            });
    });

    /***
     * Monitor Other Commands
     **/
    on({id: STATE_PATH + 'Commands.' + 'textToSpeech', change:"any"}, function (obj) {
        var txtSp = obj.state.val;
        txtSp = txtSp.replace(/[^a-zA-Z0-9ß-ü]/g,'');  // Just keep letters, numbers, and umlauts
        txtSp = txtSp.replace(/ +/g, ' '); // Remove multiple spaces
        if (txtSp.length > 1) {
            fullySendCommand(obj.common.name + '&text=' + txtSp);
            if (EXTINFO) log('Gesendet: ' + obj.common.name + ', [' + txtSp + ']');            
        }
    });
    on({id: STATE_PATH + 'Commands.' + 'loadURL', change:"any"}, function (obj) {
        var strUrl = obj.state.val;
        strUrl = strUrl.replace(/ /g,""); // Remove Spaces
        if (! strUrl.match(/^https?:\/\//)) strUrl = 'http://' + strUrl; // add http if URL is not starting with "http://" or "https://"

        if (strUrl.length > 10) {
            fullySendCommand(obj.common.name + '&url=' + strUrl);
            if (EXTINFO) log('Gesendet: ' + obj.common.name + ', [' + strUrl + ']');
        } else {
            log('URL für Fully-Browser-Kommando [loadURL] scheint nicht valide, daher Befehl nicht ausgeführt.', 'warn');
        }
    });

}



/*******************************************************************************
 * More Functions
 *******************************************************************************/


 /**
 * Sends a command to Fully Browser via http
 * @param {string} strCommand    Command, see https://www.ozerov.de/fully-kiosk-browser/de/#rest
 */
function fullySendCommand(strCommand){

    var request = require('request');
    
    var options = {
        url: 'http://' + FULLY_IP + ':' + FULLY_PORT + '/?cmd=' + strCommand + '&password=' + FULLY_PASSWORD
    };
    request(options, function (error, response, body) {
        if (response !== undefined) {
            if (EXTINFO) log('Fully Browser: sent command [' + strCommand + '], response: ' + response.statusCode); 
        } else {
            log('Fully Browser: no response!', 'error'); 
        }
        
    });
}



/**
 * Fetches the Fully Browser information and updates the states in ioBroker
 */
function getFullyBrowserInfo() {

    var statusURL = 'http://' + FULLY_IP + ':' + FULLY_PORT + '/?cmd=deviceInfo&type=json&password=' + FULLY_PASSWORD;

    var thisRequest = require("request");

    var thisOptions = {
      uri: statusURL,
      method: "GET",
      timeout: 2000,
      followRedirect: false,
      maxRedirects: 0
    };

    thisRequest(thisOptions, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            fullyInfoObject = JSON.parse(body);
            var count = 0;
            for (let lpEntry in fullyInfoObject) {
                setState(STATE_PATH + 'Info.' + lpEntry, fullyInfoObject[lpEntry]);
                count++;
            }
            if (FDEBUG) log('Fully Browser: ' + count + ' Informationen abgerufen und in Datenpunkte geschrieben.');
            setState(STATE_PATH + 'Info2.' + 'isFullyAlive', true);
        }
        else {
            log('Fully Browser: Folgender Fehler bei http-Request aufgetreten: ' + error, 'warn');
            setState(STATE_PATH + 'Info2.' + 'isFullyAlive', false);
        }
        setState(STATE_PATH + 'Info2.' + 'lastInfoUpdate', Date.now());
    });

}



/**
 * Create states needed for this script
 */
function createScriptStates() {

    // Informationen vom Fully-Browser
    createState(STATE_PATH + 'Info.' + 'foregroundApp', {'name':'foregroundApp', 'type':'string', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'appVersionName', {'name':'appVersionName', 'type':'string', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'ssid', {'name':'ssid', 'type':'string', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'appFreeMemory', {'name':'appFreeMemory', 'type':'number', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'batteryLevel', {'name':'batteryLevel', 'type':'number', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'wifiSignalLevel', {'name':'wifiSignalLevel', 'type':'number', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'appUsedMemory', {'name':'appUsedMemory', 'type':'number', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'deviceManufacturer', {'name':'deviceManufacturer', 'type':'string', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'displayHeightPixels', {'name':'displayHeightPixels', 'type':'number', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'totalUsedMemory', {'name':'totalUsedMemory', 'type':'number', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'ip4', {'name':'ip4', 'type':'string', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'displayWidthPixels', {'name':'displayWidthPixels', 'type':'number', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'androidVersion', {'name':'androidVersion', 'type':'string', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'kioskMode', {'name':'kioskMode', 'type':'boolean', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'deviceModel', {'name':'deviceModel', 'type':'string', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'totalFreeMemory', {'name':'totalFreeMemory', 'type':'number', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'currentPage', {'name':'currentPage', 'type':'string', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'currentFragment', {'name':'currentFragment', 'type':'string', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'webviewUa', {'name':'webviewUa', 'type':'string', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'appVersionCode', {'name':'appVersionCode', 'type':'number', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'mac', {'name':'mac', 'type':'string', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'screenBrightness', {'name':'screenBrightness', 'type':'number', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'androidSdk', {'name':'androidSdk', 'type':'string', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'isDeviceOwner', {'name':'isDeviceOwner', 'type':'boolean', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'hostname4', {'name':'hostname4', 'type':'string', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'ip6', {'name':'ip6', 'type':'string', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'currentTabIndex', {'name':'currentTabIndex', 'type':'number', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'deviceID', {'name':'deviceID', 'type':'string', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'isDeviceAdmin', {'name':'isDeviceAdmin', 'type':'boolean', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'lastAppStart', {'name':'lastAppStart', 'type':'string', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'hostname6', {'name':'hostname6', 'type':'string', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'plugged', {'name':'plugged', 'type':'boolean', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'motionDetectorState', {'name':'motionDetectorState', 'type':'number', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'maintenanceMode', {'name':'maintenanceMode', 'type':'boolean', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'keyguardLocked', {'name':'keyguardLocked', 'type':'boolean', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'startUrl', {'name':'startUrl', 'type':'string', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info.' + 'isScreenOn', {'name':'isScreenOn', 'type':'boolean', 'read':true, 'write':false, 'role':'info'});

    // Weitere Infos, die von diesem Script selbst stammen bzw. gesetzt werden
    createState(STATE_PATH + 'Info2.' + 'isFullyAlive', {'name':'Is Fully Browser Alive?', 'type':'boolean', 'read':true, 'write':false, 'role':'info'});
    createState(STATE_PATH + 'Info2.' + 'lastInfoUpdate', {'name':'Date/Time of last information update from Fully Browser', 'type':'number', 'read':true, 'write':false, 'role':'value.time'});    

    // Commands: Buttons
    createState(STATE_PATH + 'Commands.' + 'loadStartURL', {'name':'loadStartURL', 'type':'boolean', 'read':false, 'write':true, 'role':'button'});
    createState(STATE_PATH + 'Commands.' + 'clearCache', {'name':'clearCache', 'type':'boolean', 'read':false, 'write':true, 'role':'button'});
    createState(STATE_PATH + 'Commands.' + 'restartApp', {'name':'restartApp', 'type':'boolean', 'read':false, 'write':true, 'role':'button'});
    createState(STATE_PATH + 'Commands.' + 'exitApp', {'name':'exitApp', 'type':'boolean', 'read':false, 'write':true, 'role':'button'});
    createState(STATE_PATH + 'Commands.' + 'screenOn', {'name':'screenOn', 'type':'boolean', 'read':false, 'write':true, 'role':'button'});
    createState(STATE_PATH + 'Commands.' + 'screenOff', {'name':'screenOff', 'type':'boolean', 'read':false, 'write':true, 'role':'button'});
    createState(STATE_PATH + 'Commands.' + 'forceSleep', {'name':'forceSleep', 'type':'boolean', 'read':false, 'write':true, 'role':'button'});
    createState(STATE_PATH + 'Commands.' + 'triggerMotion', {'name':'triggerMotion', 'type':'boolean', 'read':false, 'write':true, 'role':'button'});
    createState(STATE_PATH + 'Commands.' + 'startScreensaver', {'name':'startScreensaver', 'type':'boolean', 'read':false, 'write':true, 'role':'button'});
    createState(STATE_PATH + 'Commands.' + 'stopScreensaver', {'name':'stopScreensaver', 'type':'boolean', 'read':false, 'write':true, 'role':'button'});
    createState(STATE_PATH + 'Commands.' + 'startDaydream', {'name':'startDaydream', 'type':'boolean', 'read':false, 'write':true, 'role':'button'});
    createState(STATE_PATH + 'Commands.' + 'stopDaydream', {'name':'stopDaydream', 'type':'boolean', 'read':false, 'write':true, 'role':'button'});
    createState(STATE_PATH + 'Commands.' + 'toForeground', {'name':'toForeground', 'type':'boolean', 'read':false, 'write':true, 'role':'button'});
    createState(STATE_PATH + 'Commands.' + 'popFragment', {'name':'popFragment', 'type':'boolean', 'read':false, 'write':true, 'role':'button'});
    createState(STATE_PATH + 'Commands.' + 'enableLockedMode', {'name':'enableLockedMode', 'type':'boolean', 'read':false, 'write':true, 'role':'button'});
    createState(STATE_PATH + 'Commands.' + 'disableLockedMode', {'name':'disableLockedMode', 'type':'boolean', 'read':false, 'write':true, 'role':'button'});
    // Commands: Strings
    createState(STATE_PATH + 'Commands.' + 'textToSpeech', {'name':'textToSpeech', 'type':'string', 'read':true, 'write':true, 'role':'text'});
    createState(STATE_PATH + 'Commands.' + 'loadURL', {'name':'loadURL', 'type':'string', 'read':true, 'write':true, 'role':'text'});



}



