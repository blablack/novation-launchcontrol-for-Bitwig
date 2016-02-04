/*
	 A Novation LaunchControl script for BitWig-Studio

	The User-Pages emmit midi events that can be used to midi-learn the knobs and buttons to in Bitwig
	The script is based on the work of eduk (https://github.com/educk)
	The knob takeover implementation is based on the work of [phaethon](https://github.com/phaethon)

	The Factory-Pages are mapped to the following functions:

	Factory-Page 1 & 5: 
		 the top row knobs control volume
		 the lower row knobs controle pan
		 the buttons are mapped to Play, Record, Writing Arranger Automation, Loop, Click, Launcher Overdub, Overdub

	Factory-Page 2 & 6: 
		 the top row knobs control send1
		 the lower row knobs controle send2
		 the buttons are mapped to mute

	Factory-Page 3 & 7: 
		 the left 8 knobs are mapped to Macro Functions
		 the right 8 knobs are mapped to Device Parameters
		 the buttons are mapped to record arm 

	Factory-Page 4 & 8: 
		 the knobs aren't currently mapped
		 the buttons create an empty clip on the next free slot of the selected Track. The button number is the clip lenght in bars
*/

loadAPI(1);

host.defineController("Novation", "Launch Control", "1.0", "05e2b820-177e-11e4-8c21-0800200c9a66");
host.defineMidiPorts(1, 1);
host.addDeviceNameBasedDiscoveryPair(["Launch Control"], ["Launch Control"]);
host.addDeviceNameBasedDiscoveryPair(["Launch Control MIDI 1"], ["Launch Control MIDI 1"]);


//Load LaunchControl constants containing the status for pages and other constant variables
load("LaunchControl_constants.js");
//load("LaunchControl_common.js");


/*
var FactoryPagePads = FactoryPagePads;
var FactoryPageKnobs = FactoryPageKnobs;
*/

mixerAlignedGrid = false;

currentScene = Scenes.FACTORY1;

isPlaying = false;
isRecording = false;
isWritingArrangerAutomation = false;
isLoopActive = false;
isClickActive = false;
isOverdubActive = false;
isLauncherOverdubActive = false;

var hasContent = initArray(0, 64)
selectedChannel = 0
muted = []
armed = []

var MODE_VOLUME = 0;
var MODE_PAN = 1;

var observed = [];

function init()
{
	// Setup MIDI in stuff
	host.getMidiInPort(0).setMidiCallback(onMidi);
	host.getMidiInPort(0).setSysexCallback(onSysex);

	noteInput = host.getMidiInPort(0).createNoteInput("Launch Control", "80????", "90????");
	noteInput.setShouldConsumeEvents(false);
	
	// create a transport for on Factory Preset 1
	transport = host.createTransport();
	sendMidi( FactoryPagePads.Page1, Pads.PAD1, Colour.YELLOW_LOW );

	transport.addIsPlayingObserver(function(on) {
	  	sendMidi( FactoryPagePads.Page1, Pads.PAD2,  on ? Colour.LIME : Colour.GREEN_LOW );
	  	isPlaying = on;
	});
	transport.addIsRecordingObserver(function(on) {
	  	sendMidi( FactoryPagePads.Page1, Pads.PAD3,  on ? Colour.RED_FULL : Colour.RED_LOW );
	  	isRecording = on;
	});
	transport.addIsWritingArrangerAutomationObserver(function(on) {
	  	sendMidi( FactoryPagePads.Page1, Pads.PAD4,  on ? Colour.RED_FULL : Colour.OFF );
	  	isWritingArrangerAutomation = on;
	});

	transport.addIsLoopActiveObserver(function(on) {
	  	sendMidi( FactoryPagePads.Page1, Pads.PAD5,  on ? Colour.ORANGE : Colour.OFF );
	  	isLoopActive = on;
	});
	transport.addClickObserver(function(on) {
	  	sendMidi( FactoryPagePads.Page1, Pads.PAD6,  on ? Colour.ORANGE : Colour.OFF );
	  	isClickActive = on;
	});
	transport.addLauncherOverdubObserver(function(on) {
	  	sendMidi( FactoryPagePads.Page1, Pads.PAD7,  on ? Colour.RED_FULL : Colour.OFF );
	  	isLauncherOverdubActive = on;
	});

	transport.addOverdubObserver(function(on) {
	  	sendMidi( FactoryPagePads.Page1, Pads.PAD8,  on ? Colour.ORANGE : Colour.OFF );
	  	isOverdubActive = on;
	});

	for (var i = 0; i<2; i++) { 
		observed[i] = { values: [], changes: [], jumps: []}
	}

	trackBank = host.createTrackBank(NUM_TRACKS, NUM_SENDS, NUM_SCENES);
 	for ( var i=0; i<8; i++ ) {
	  	var track = trackBank.getTrack( i )

	  	track.getMute().addValueObserver(makeIndexedFunction(i, function(col, on) {
			muted[ col ] = on;
			sendMidi( FactoryPagePads.Page2, PadIndex[col], on ? Colour.ORANGE : Colour.YELLOW_LOW  );
		}));
		track.getVolume().addValueObserver(128, makeValueObserver(MODE_VOLUME, i));
		track.getPan().addValueObserver(128, makeValueObserver(MODE_PAN, i));
		track.getArm().addValueObserver(makeIndexedFunction(i, function(col, on) {
			armed[ col ] = on;
			sendMidi( FactoryPagePads.Page3, PadIndex[col], on ? Colour.RED_FULL : Colour.LIME );
		}));
		track.addIsSelectedInMixerObserver( makeIndexedFunction(i, function( col, on ) { 
			if ( on ) {
				selectedChannel = col;
			}
	  	}));
	  	var clipLauncher = track.getClipLauncher();
	  	clipLauncher.addHasContentObserver( makeSlotIndexedFunction(i, function( track, slot, on ) {
			hasContent[ track * 8 + slot ] = on;	  
	  	}));
	
		for (var j = 0; j < 2; j++) {
			observed[j].changes[i] = false;
			observed[j].jumps[i] = false;
	  	}
	}

	// create a cursor device to move about using the arrows
	cursorTrack = host.createCursorTrack(0, 8);
	cursorDevice = host.createCursorDevice();
	masterTrack = host.createMasterTrack(0);

	primaryDevice = cursorTrack.getPrimaryDevice();
	
	// Make CCs 21-48 freely mappable for all 16 Channels
	userControls = host.createUserControls((HIGHEST_CC - LOWEST_CC + 1)*16);

	for(var i=LOWEST_CC; i<=HIGHEST_CC; i++) {
		for (var j=1; j<=16; j++) { 
			// Create the index variable c
			var c = i - LOWEST_CC + (j-1) * (HIGHEST_CC-LOWEST_CC+1);
			// Set a label/name for each userControl
			userControls.getControl(c).setLabel("CC " + i + " - Channel " + j);
		}
	}
	
	// Call the update indicators function so that those rainbow indicators display
	updateIndications();
}

// This updates the indicators (rainbow things) 
function updateIndications() 
{
	for(var i=0; i<8; i++) {
		trackBank.getTrack(i).getVolume().setIndication( currentScene == Scenes.FACTORY1 ) 
		trackBank.getTrack(i).getPan().setIndication( currentScene == Scenes.FACTORY1 ) 

		trackBank.getTrack(i).getSend(0).setIndication( currentScene == Scenes.FACTORY2 ) 
		trackBank.getTrack(i).getSend(1).setIndication( currentScene == Scenes.FACTORY2 ) 

		primaryDevice.getParameter(i).setIndication( currentScene == Scenes.FACTORY3 )
		primaryDevice.getMacro(i).getAmount().setIndication( currentScene == Scenes.FACTORY3 )

		var isUserControl = (currentScene != Scenes.FACTORY1 && currentScene != Scenes.FACTORY2 && currentScene !=Scenes.FACTORY3)
		userControls.getControl(i).setIndication( isUserControl );
	}

	if ( currentScene == Scenes.FACTORY1 ) {
		sendMidi( FactoryPagePads.Page1, Pads.PAD1, Colour.YELLOW_LOW );
		sendMidi( FactoryPagePads.Page1, Pads.PAD2, isPlaying ? Colour.LIME : Colour.GREEN_LOW );
		sendMidi( FactoryPagePads.Page1, Pads.PAD3, isRecording ? Colour.RED_FULL : Colour.RED_LOW );
		sendMidi( FactoryPagePads.Page1, Pads.PAD4, isWritingArrangerAutomation ? Colour.RED_FULL : Colour.OFF );
		sendMidi( FactoryPagePads.Page1, Pads.PAD5, isLoopActive ? Colour.ORANGE : Colour.OFF );
		sendMidi( FactoryPagePads.Page1, Pads.PAD6, isClickActive ? Colour.ORANGE : Colour.OFF );
		sendMidi( FactoryPagePads.Page1, Pads.PAD7, isLauncherOverdubActive ? Colour.RED_FULL : Colour.OFF );
		sendMidi( FactoryPagePads.Page1, Pads.PAD8, isOverdubActive ? Colour.ORANGE : Colour.OFF );

		sendMidi( FactoryPagePads.Page5, Pads.PAD1, Colour.YELLOW_LOW );
		sendMidi( FactoryPagePads.Page5, Pads.PAD2, isPlaying ? Colour.LIME : Colour.GREEN_LOW );
		sendMidi( FactoryPagePads.Page5, Pads.PAD3, isRecording ? Colour.RED_FULL : Colour.RED_LOW );
		sendMidi( FactoryPagePads.Page5, Pads.PAD4, isWritingArrangerAutomation ? Colour.RED_FULL : Colour.OFF );
		sendMidi( FactoryPagePads.Page5, Pads.PAD5, isLoopActive ? Colour.ORANGE : Colour.OFF );
		sendMidi( FactoryPagePads.Page5, Pads.PAD6, isClickActive ? Colour.ORANGE : Colour.OFF );
		sendMidi( FactoryPagePads.Page5, Pads.PAD7, isLauncherOverdubActive ? Colour.RED_FULL : Colour.OFF );
		sendMidi( FactoryPagePads.Page5, Pads.PAD8, isOverdubActive ? Colour.ORANGE : Colour.OFF );
	} 
	else if ( currentScene == Scenes.FACTORY2 ) {
		for ( var i=0; i<8; i++) {
			sendMidi( FactoryPagePads.Page2, PadIndex[i], muted[ i ]  ?  Colour.ORANGE : Colour.YELLOW_LOW  );
			sendMidi( FactoryPagePads.Page6, PadIndex[i], muted[ i ]  ?  Colour.ORANGE : Colour.YELLOW_LOW  );
		}
	} 
	else if ( currentScene == Scenes.FACTORY3 ) {
		for ( var i=0; i<8; i++) {
			sendMidi( FactoryPagePads.Page3, PadIndex[i], armed[ i ]  ?  Colour.RED_FULL : Colour.LIME  );
			sendMidi( FactoryPagePads.Page7, PadIndex[i], armed[ i ]  ?  Colour.RED_FULL : Colour.LIME  );
		}
	} 
	else if ( currentScene == Scenes.FACTORY4 ) {
		for ( var i=0; i<8; i++) {
			sendMidi( FactoryPagePads.Page4, PadIndex[i], Colour.RED_LOW );
			sendMidi( FactoryPagePads.Page8, PadIndex[i], Colour.RED_LOW );
		}
 	}
}


var incontrol_mix = true;
//var incontrol_knobs = true;
//var incontrol_pads = true;


function makeValueObserver(type, index) 
{
	return function(value) { 
		if (! observed[type].changes[index])
			observed[type].jumps[index] = true;
		else
			observed[type].changes[index] = false;
	  	
		observed[type].values[index] = value;
	}
}

function onMidi(status, data1, data2)
{
	if( data1 >= 114 && data1 <= 117 ) {
		if (data2 == 127) {
			sendMidi(status, data1, Colour.RED_FULL);
		}
		else if (data2 == 0) {
			sendMidi(status, data1, Colour.OFF);	
		}
	}
	
	if (status == FactoryPagePads.Page1 && data2 == 127) {
	  	handleFactory1Pads( data1 )
	} 
	else if (status == FactoryPagePads.Page2 && data2 == 127) {
		handleFactory2Pads( data1 )
	} 
	else if (status == FactoryPagePads.Page3 && data2 == 127) {
		handleFactory3Pads( data1 )
	} 
	else if (status == FactoryPagePads.Page4 && data2 == 127) {
	  	handleFactory4Pads( data1 )
	}

	if ( status == FactoryPageKnobs.Page1 && isTopRow( data1 ) ) {
		index = data1 - 21;
		var diff = data2 - observed[MODE_VOLUME].values[index];
		if (! observed[MODE_VOLUME].jumps[index] || (Math.abs(diff) < 2)) {
			observed[MODE_VOLUME].changes[index] = true;
			observed[MODE_VOLUME].jumps[index] = false;
			trackBank.getTrack( knobIndex( data1 )).getVolume().set(data2, 128);
		}
	} 
	else if ( status == FactoryPageKnobs.Page1 && isBottomRow( data1 )) {
		index = data1 - 41;
		var diff = data2 - observed[MODE_PAN].values[index];
		if (! observed[MODE_PAN].jumps[index] || (Math.abs(diff) < 2)) {
			observed[MODE_PAN].changes[index] = true;
			observed[MODE_PAN].jumps[index] = false;
			trackBank.getTrack( knobIndex( data1 )).getPan().set(data2, 128);
		}
	} 
	else if (status == FactoryPageKnobs.Page2 && isTopRow( data1 )) {
		trackBank.getTrack( knobIndex( data1 )).getSend(0).set(data2, 128);
	} 
	else if ( status == FactoryPageKnobs.Page2 && isBottomRow( data1 )) {
		trackBank.getTrack( knobIndex( data1 )).getSend(1).set(data2, 128);
	} 
	else if (status == FactoryPageKnobs.Page3 && isTopRow( data1 )) {
		var idx = knobIndex( data1 )
		if ( idx < 4 ) 
			primaryDevice.getMacro( idx ).getAmount().set(data2, 128);
		else
			primaryDevice.getParameter( idx-4 ).set(data2, 128);
	} 
	else if (status == FactoryPageKnobs.Page3 && isBottomRow( data1 )) {
	  	var idx = knobIndex( data1 )
	  	if ( idx < 4 )
			primaryDevice.getMacro( idx+4 ).getAmount().set(data2, 128);
		else 
			primaryDevice.getParameter( idx ).set(data2, 128);
	} 
	else {
		// If not on a Factory Bank already assigned then make the knobs assignable and 
		// assign those arrows on the right of the control to move around the tracks and devices on the screen
		if (isChannelController(status)) {
			if (data2 == 127) {
				if (!incontrol_mix) {
			 		switch( data1 ) {
			  			case SideButton.UP:
							primaryDevice.previousParameterPage();
					 		updateIndications();
							break;
			  			case SideButton.DOWN:
							primaryDevice.nextParameterPage();
							updateIndications();
							break;
						case SideButton.LEFT:
							cursorDevice.selectPrevious();
							primaryDevice.switchToDevice( DeviceType.ANY, ChainLocation.PREVIOUS);
							updateIndications();
					 		break;
			  			case SideButton.RIGHT:
							cursorDevice.selectNext();
							primaryDevice.switchToDevice( DeviceType.ANY, ChainLocation.NEXT);
							updateIndications();
							break;
			 		}
			  
				} 
				else {
			 		switch( data1 ) {
			  			case SideButton.UP:
							trackBank.scrollTracksPageDown();
							break;
			  			case SideButton.DOWN:
							trackBank.scrollTracksPageUp();
							break;
			  			case SideButton.LEFT:
						 	trackBank.scrollTracksUp();
							break;
			  			case SideButton.RIGHT:
							trackBank.scrollTracksDown();
							break;
					}
				}
			}
			// Make rest of the knobs not in the Factory bank freely assignable
			else if (data1 >= LOWEST_CC && data1 <= HIGHEST_CC) {
				var index = data1 - LOWEST_CC + (HIGHEST_CC * MIDIChannel(status));
				if( userControls.getControl(index) != null ) userControls.getControl(index).set(data2, 128);
			}
		}
	}
}


function isTopRow( knob ) 
{
	return knob >= 21 && knob <= 28;
}

function isBottomRow( knob ) 
{
	return knob >= 41 && knob <= 48;
}

function knobIndex( knob ) 
{
	return knob -( isTopRow( knob ) ? 21 : 41 );
}

function exit() 
{
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

function handleFactory1Pads( pad ) 
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


function handleFactory2Pads( pad ) 
{
	var idx = PadIndex.indexOf( pad )
	trackBank.getTrack( idx ).getMute().toggle();
}


function handleFactory3Pads( pad ) 
{
	var idx = PadIndex.indexOf( pad )
	var track = trackBank.getTrack( idx )
	var old = armed[idx]
	track.getArm().toggle();
	if ( !old ) {
		track.selectInMixer()
	}
}

function handleFactory4Pads( pad ) 
{
	for ( var i=0; i<8; i++) {
		if ( !hasContent[ selectedChannel * 8 + i ] ) {
			emptySlot = i;
			break;
	  	}
	}	 

	if ( emptySlot == -1 ) {
	  	return;
	} 
	else {
		var idx = PadIndex.indexOf( pad );
	 	trackBank.getTrack( selectedChannel ).getClipLauncherSlots().createEmptyClip( emptySlot, (idx+1) * 4 );
	}
}

function onSysex(data) 
{
	if ( data.substring(0,14) == 'f0002029020a77' ) {
		currentScene = parseInt( data.substring(14,16), 16);

		if( currentScene >= 12)
			currentScene = currentScene - 4;
	  	
	  	if ( currentScene == Scenes.FACTORY3 ) {
			mixerAlignedGrid = false;
		  	incontrol_mix = false;		  
	  	}
	  
	  	if ( currentScene == Scenes.FACTORY1 || currentScene == Scenes.FACTORY2 || currentScene == Scenes.FACTORY4) {
			mixerAlignedGrid = true;
			incontrol_mix = true;
	  	}

		if( currentScene >= 0 && currentScene <= 7 ) {
			host.showPopupNotification("User " + (currentScene + 1));
		}
		else {
			switch( currentScene ) {
				case 8:
					host.showPopupNotification("Transport, Volumes & Pans");
					break;

				case 9:
					host.showPopupNotification("Mutes, Sends 1 & 2");
					break;

				case 10:
					host.showPopupNotification("Records, Macros and Devices");
					break;

				case 11:
					host.showPopupNotification("Create free slots");
					break;
			}
		}

		updateIndications();
	}
}

function makeIndexedFunction(index, f) 
{
	return function(value) {
	  	f(index, value);
	};
}

function makeSlotIndexedFunction( track, f) 
{
	return function( s, v) {
	  	f(track, s, v)
	}
}
