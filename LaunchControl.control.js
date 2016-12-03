/*
	 A Novation LaunchControl script for BitWig-Studio

	The User-Pages emmit midi events that can be used to midi-learn the knobs and buttons to in Bitwig
	The script is based on the work of eduk (https://github.com/educk)
	The knob takeover implementation is based on the work of [phaethon](https://github.com/phaethon)

	The buttons are mapped to Play, Record, Writing Arranger Automation, Loop, Click, Launcher Overdub, Overdub
*/

loadAPI(1);

host.defineController("Novation", "Launch Control", "1.0", "05e2b820-177e-11e4-8c21-0800200c9a66");
host.defineMidiPorts(1, 1);
host.addDeviceNameBasedDiscoveryPair(["Launch Control"], ["Launch Control"]);
host.addDeviceNameBasedDiscoveryPair(["Launch Control MIDI 1"], ["Launch Control MIDI 1"]);


//Load LaunchControl constants containing the status for pages and other constant variables
load("LaunchControl_constants.js");

currentScene = Scenes.FACTORY1;

isPlaying = false;
isRecording = false;
isWritingArrangerAutomation = false;
isLoopActive = false;
isClickActive = false;
isOverdubActive = false;
isLauncherOverdubActive = false;

function init()
{
	host.getMidiInPort(0).setMidiCallback(onMidi);
	host.getMidiInPort(0).setSysexCallback(onSysex);

	noteInput = host.getMidiInPort(0).createNoteInput("Launch Control", "B?????");
	noteInput.setShouldConsumeEvents(false);

	resetDevice();

	animateLogo();

	transport = host.createTransport();
	sendMidiInternal( Pads.PAD1, Colour.YELLOW_LOW );

	transport.addIsPlayingObserver(function(on) {
	  	sendMidiInternal( Pads.PAD2,  on ? Colour.LIME : Colour.GREEN_LOW );
	  	isPlaying = on;
	});
	transport.addIsRecordingObserver(function(on) {
	  	sendMidiInternal( Pads.PAD3,  on ? Colour.RED_FULL : Colour.RED_LOW );
	  	isRecording = on;
	});
	transport.addIsWritingArrangerAutomationObserver(function(on) {
	  	sendMidiInternal( Pads.PAD4,  on ? Colour.RED_FULL : Colour.OFF );
	  	isWritingArrangerAutomation = on;
	});

	transport.addIsLoopActiveObserver(function(on) {
	  	sendMidiInternal( Pads.PAD5,  on ? Colour.ORANGE : Colour.OFF );
	  	isLoopActive = on;
	});
	transport.addClickObserver(function(on) {
	  	sendMidiInternal( Pads.PAD6,  on ? Colour.ORANGE : Colour.OFF );
	  	isClickActive = on;
	});
	transport.addLauncherOverdubObserver(function(on) {
	  	sendMidiInternal( Pads.PAD7,  on ? Colour.RED_FULL : Colour.OFF );
	  	isLauncherOverdubActive = on;
	});

	transport.addOverdubObserver(function(on) {
	  	sendMidiInternal( Pads.PAD8,  on ? Colour.ORANGE : Colour.OFF );
	  	isOverdubActive = on;
	});
	
	cursorTrack = host.createCursorTrack(0, 8);
	primaryDevice = cursorTrack.getPrimaryDevice();
	
	userControls = host.createUserControls((HIGHEST_CC - LOWEST_CC + 1)*16);

	for(var i=LOWEST_CC; i<=HIGHEST_CC; i++) {
		for (var j=1; j<=16; j++) { 
			var c = i - LOWEST_CC + (j-1) * (HIGHEST_CC-LOWEST_CC+1);
			userControls.getControl(c).setLabel("CC " + i + " - Channel " + j);
		}
	}
}

function onMidi(status, data1, data2)
{
	//host.showPopupNotification(data1);
	
	if (status >= FactoryPagePads.Page1 && status <= FactoryPagePads.Page8 && data2 == 127) 
	{
	  	handleFactoryPads( data1 );
	}
	else if (status >= FactoryPageKnobs.Page1 && status <= FactoryPageKnobs.Page8) {
		var idx = knobIndex( data1 );
		if (isLeftKnob(data1))
			primaryDevice.getMacro( idx ).getAmount().set(data2, 128);
		else if (isRightKnob(data1))
			primaryDevice.getParameter( idx-4 ).set(data2, 128);
	}
}

function isLeftKnob( knob ) 
{
	return (knob >= 21 && knob <= 24) || (knob >= 41 && knob <= 44);
}

function isRightKnob( knob ) 
{
	return (knob >= 25 && knob <= 28) || (knob >= 45 && knob <= 48);
}


function animateLogoPad( Page )
{
	switch(logoPhase) {
			case 0:
				sendMidi( Page, Pads.PAD1, Colour.RED_FULL );
				sendMidi( Page, Pads.PAD2, Colour.OFF );
				sendMidi( Page, Pads.PAD3, Colour.OFF );
				sendMidi( Page, Pads.PAD4, Colour.OFF );
				sendMidi( Page, Pads.PAD5, Colour.OFF );
				sendMidi( Page, Pads.PAD6, Colour.OFF );
				sendMidi( Page, Pads.PAD7, Colour.OFF );
				sendMidi( Page, Pads.PAD8, Colour.LIME );
				break;
			case 1:
				sendMidi( Page, Pads.PAD1, Colour.OFF );
				sendMidi( Page, Pads.PAD2, Colour.RED_FULL );
				sendMidi( Page, Pads.PAD3, Colour.OFF );
				sendMidi( Page, Pads.PAD4, Colour.OFF );
				sendMidi( Page, Pads.PAD5, Colour.OFF );
				sendMidi( Page, Pads.PAD6, Colour.OFF );
				sendMidi( Page, Pads.PAD7, Colour.LIME );
				sendMidi( Page, Pads.PAD8, Colour.OFF );
				break;
			case 2:
				sendMidi( Page, Pads.PAD1, Colour.OFF );
				sendMidi( Page, Pads.PAD2, Colour.OFF );
				sendMidi( Page, Pads.PAD3, Colour.RED_FULL );
				sendMidi( Page, Pads.PAD4, Colour.OFF );
				sendMidi( Page, Pads.PAD5, Colour.OFF );
				sendMidi( Page, Pads.PAD6, Colour.LIME );
				sendMidi( Page, Pads.PAD7, Colour.OFF );
				sendMidi( Page, Pads.PAD8, Colour.OFF );
				break;
			case 3:
				sendMidi( Page, Pads.PAD1, Colour.OFF );
				sendMidi( Page, Pads.PAD2, Colour.OFF );
				sendMidi( Page, Pads.PAD3, Colour.OFF );
				sendMidi( Page, Pads.PAD4, Colour.RED_FULL );
				sendMidi( Page, Pads.PAD5, Colour.LIME );
				sendMidi( Page, Pads.PAD6, Colour.OFF );
				sendMidi( Page, Pads.PAD7, Colour.OFF );
				sendMidi( Page, Pads.PAD8, Colour.OFF );
				break;
			case 4:
				sendMidi( Page, Pads.PAD1, Colour.OFF );
				sendMidi( Page, Pads.PAD2, Colour.OFF );
				sendMidi( Page, Pads.PAD3, Colour.OFF );
				sendMidi( Page, Pads.PAD4, Colour.LIME );
				sendMidi( Page, Pads.PAD5, Colour.RED_FULL );
				sendMidi( Page, Pads.PAD6, Colour.OFF );
				sendMidi( Page, Pads.PAD7, Colour.OFF );
				sendMidi( Page, Pads.PAD8, Colour.OFF );
				break;
			case 5:
				sendMidi( Page, Pads.PAD1, Colour.OFF );
				sendMidi( Page, Pads.PAD2, Colour.OFF );
				sendMidi( Page, Pads.PAD3, Colour.LIME );
				sendMidi( Page, Pads.PAD4, Colour.OFF );
				sendMidi( Page, Pads.PAD5, Colour.OFF );
				sendMidi( Page, Pads.PAD6, Colour.RED_FULL );
				sendMidi( Page, Pads.PAD7, Colour.OFF );
				sendMidi( Page, Pads.PAD8, Colour.OFF );
				break;
			case 6:
				sendMidi( Page, Pads.PAD1, Colour.OFF );
				sendMidi( Page, Pads.PAD2, Colour.LIME );
				sendMidi( Page, Pads.PAD3, Colour.OFF );
				sendMidi( Page, Pads.PAD4, Colour.OFF );
				sendMidi( Page, Pads.PAD5, Colour.OFF );
				sendMidi( Page, Pads.PAD6, Colour.OFF );
				sendMidi( Page, Pads.PAD7, Colour.RED_FULL );
				sendMidi( Page, Pads.PAD8, Colour.OFF );
				break;
			case 7:
				sendMidi( Page, Pads.PAD1, Colour.LIME );
				sendMidi( Page, Pads.PAD2, Colour.OFF );
				sendMidi( Page, Pads.PAD3, Colour.OFF );
				sendMidi( Page, Pads.PAD4, Colour.OFF );
				sendMidi( Page, Pads.PAD5, Colour.OFF );
				sendMidi( Page, Pads.PAD6, Colour.OFF );
				sendMidi( Page, Pads.PAD7, Colour.OFF );
				sendMidi( Page, Pads.PAD8, Colour.RED_FULL );
				break;
			case 8:
				sendMidi( Page, Pads.PAD1, Colour.OFF );
				sendMidi( Page, Pads.PAD2, Colour.OFF );
				sendMidi( Page, Pads.PAD3, Colour.OFF );
				sendMidi( Page, Pads.PAD4, Colour.OFF );
				sendMidi( Page, Pads.PAD5, Colour.OFF );
				sendMidi( Page, Pads.PAD6, Colour.OFF );
				sendMidi( Page, Pads.PAD7, Colour.OFF );
				sendMidi( Page, Pads.PAD8, Colour.OFF );
				break;
		}
}

var logoPhase = 0;
var logoStep = 0;
function animateLogo()
{
	if (logoStep > 1) {
		// Call the update indicators function so that those rainbow indicators display
		updateIndications();
		return;
   	}
   	else {
		animateLogoPad( FactoryPagePads.Page1 );
		animateLogoPad( FactoryPagePads.Page2 );
		animateLogoPad( FactoryPagePads.Page3 );
		animateLogoPad( FactoryPagePads.Page4 );
		animateLogoPad( FactoryPagePads.Page5 );
		animateLogoPad( FactoryPagePads.Page6 );
		animateLogoPad( FactoryPagePads.Page7 );
		animateLogoPad( FactoryPagePads.Page8 );
	}

	if( logoStep == 0 || logoStep == 2 || logoStep == 4 || logoStep == 6 || logoStep == 8 )
		logoPhase++;
	else
		logoPhase--;

	if (logoPhase > 7 || logoPhase < 0)
		logoStep++

	host.scheduleTask(animateLogo, null, 125);
}

// This updates the indicators (rainbow things) 
function updateIndications() 
{
	if ( currentScene == Scenes.FACTORY1 || currentScene == Scenes.FACTORY2 || currentScene == Scenes.FACTORY3 || currentScene == Scenes.FACTORY4 ) 
	{
		sendMidiInternal( Pads.PAD1, Colour.YELLOW_LOW );
		sendMidiInternal( Pads.PAD2, isPlaying ? Colour.LIME : Colour.GREEN_LOW );
		sendMidiInternal( Pads.PAD3, isRecording ? Colour.RED_FULL : Colour.RED_LOW );
		sendMidiInternal( Pads.PAD4, isWritingArrangerAutomation ? Colour.RED_FULL : Colour.OFF );
		sendMidiInternal( Pads.PAD5, isLoopActive ? Colour.ORANGE : Colour.OFF );
		sendMidiInternal( Pads.PAD6, isClickActive ? Colour.ORANGE : Colour.OFF );
		sendMidiInternal( Pads.PAD7, isLauncherOverdubActive ? Colour.RED_FULL : Colour.OFF );
		sendMidiInternal( Pads.PAD8, isOverdubActive ? Colour.ORANGE : Colour.OFF );
	}
}

function sendMidiInternal(data1, data2)
{
	sendMidi( FactoryPagePads.Page1, data1, data2 );
	sendMidi( FactoryPagePads.Page2, data1, data2 );
	sendMidi( FactoryPagePads.Page3, data1, data2 );
	sendMidi( FactoryPagePads.Page4, data1, data2 );
	sendMidi( FactoryPagePads.Page5, data1, data2 );
	sendMidi( FactoryPagePads.Page6, data1, data2 );
	sendMidi( FactoryPagePads.Page7, data1, data2 );
	sendMidi( FactoryPagePads.Page8, data1, data2 );
}

function isTopRow( knob ) 
{
	return knob >= 21 && knob <= 28;
}

function knobIndex( knob ) 
{
	return knob - ( isTopRow( knob ) ? 21 : 37 );
}

function resetDevice()
{
	sendSysex("F0002029020A7708F7");

 	sendMidi(0xB0, 0, 0);
 	sendMidi(0xB1, 0, 0);
 	sendMidi(0xB2, 0, 0);
 	sendMidi(0xB3, 0, 0);
 	sendMidi(0xB4, 0, 0);
 	sendMidi(0xB5, 0, 0);
 	sendMidi(0xB7, 0, 0);

	sendMidi(0xB8, 0, 0);
	sendMidi(0xB9, 0, 0);
	sendMidi(0xBA, 0, 0);
	sendMidi(0xBB, 0, 0);
	sendMidi(0xBC, 0, 0);
	sendMidi(0xBD, 0, 0);
	sendMidi(0xBE, 0, 0);
	sendMidi(0xBF, 0, 0);
}

function exit() 
{
	resetDevice();
}

function handleFactoryPads( pad ) 
{
	switch( pad ) {
		case Pads.PAD1:
			transport.stop();
			break;
	  	case Pads.PAD2: 
			transport.play();				  
			break;
	  	case Pads.PAD3: 
			transport.record(); 
			break;
	  	case Pads.PAD4:
			transport.toggleWriteArrangerAutomation();
			break;
	  	case Pads.PAD5:
			transport.toggleLoop();
			break;
	  	case Pads.PAD6:
			transport.toggleClick(); 
			break;  
	  	case Pads.PAD7:
			transport.toggleLauncherOverdub();
			break;
	  	case Pads.PAD8:
			transport.toggleOverdub();
			break;
	}
}


function onSysex(data) 
{
	if ( data.substring(0,14) == 'f0002029020a77' ) {
		setActivePage(parseInt( data.substring(14,16), 16));
	}
}

function setActivePage(Page)
{
	currentScene = Page;

	if( currentScene >= 12)
		currentScene = currentScene - 4;

	if( currentScene >= 0 && currentScene <= 7 ) {
		host.showPopupNotification("User " + (currentScene + 1));
	}
	else {
		host.showPopupNotification("Transport");
	}

	updateIndications();
}
