/*******************************************************************************
 * ---------------------------
 * Script: Steuerung Fully-Browser in ioBroker
 * ---------------------------
 * Quelle: https://github.com/Mic-M/iobroker.fully-kiosk-browser-script
 * Autor: Mic
 * Support: https://forum.iobroker.net/viewtopic.php?f=21&t=19105
 * Fully Browser REST Interface: https://www.ozerov.de/fully-kiosk-browser/de/#rest
 * Change log:
 * 0.3 - New information states are being created automatically if Fully App is adding additional ones.
 * 0.2 - Bug fix, added latest info states, added startApplication command
 * 0.1 - initial version
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
 
    // Create states. The info states are created through getFullyBrowserInfo()
    createScriptStates();

    // Main Script starten, 5 Sekunden nach State-Generierung
    setTimeout(main, 5000);

    // Ebenso nach 6 Sekunden Fully-Info holen bei Script-Start. Wird danach alle x Minuten ausgeführt.
    setTimeout(getFullyBrowserInfo, 6000);

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
    on({id: STATE_PATH + 'Commands.' + 'startApplication', change:"any"}, function (obj) {
        var strApp = obj.state.val;
        strApp = strApp.replace(/ /g,""); // Remove Spaces

        if (strApp.length > 2) {
            fullySendCommand(obj.common.name + '&package=' + strApp);
            if (EXTINFO) log('Gesendet: ' + obj.common.name + ', [' + strApp + ']');
        } else {
            log('Application-Name für Fully-Browser-Kommando [startApplication] scheint nicht valide, daher Befehl nicht ausgeführt.', 'warn');
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
 * Fetches the Fully Browser information and updates the states in ioBroker.
 * Also, it creates all the info states.
 */
function getFullyBrowserInfo() {

    var statusURL = 'http://' + FULLY_IP + ':' + FULLY_PORT + '/?cmd=deviceInfo&type=json&password=' + FULLY_PASSWORD;

    var thisRequest = require('request');

    var thisOptions = {
      uri: statusURL,
      method: "GET",
      timeout: 2000,
      followRedirect: false,
      maxRedirects: 0
    };

    thisRequest(thisOptions, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            var fullyInfoObject = JSON.parse(body);
            var count = 0;
            for (let lpEntry in fullyInfoObject) {
                // looks like Fully is regularly adding more information, so we create the states on the fly
                let lpType = typeof fullyInfoObject[lpEntry]; // get Type of Variable as String, like string/number/boolean
                createState(STATE_PATH + 'Info.' + lpEntry, {'name':lpEntry, 'type':lpType, 'read':true, 'write':false, 'role':'info'});
                setStateDelayed(STATE_PATH + 'Info.' + lpEntry, fullyInfoObject[lpEntry], 200);
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
 * Create states needed for this script. 
 * !Note that all the info states are created through getFullyBrowserInfo()
 */
function createScriptStates() {

    // Infos, die von diesem Script selbst stammen bzw. gesetzt werden
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
    createState(STATE_PATH + 'Commands.' + 'startApplication', {'name':'startApplication', 'type':'string', 'read':true, 'write':true, 'role':'text'});

}
