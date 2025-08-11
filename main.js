import { renderOffline } from './offline-renderer.js';

const fileInput = document.getElementById('audio-file-input');
const fileNameDisplay = document.getElementById('file-name');
const playBtn = document.getElementById('play-btn');
const stopBtn = document.getElementById('stop-btn');
const downloadLink = document.getElementById('download-link');
const bitDepthSlider = document.getElementById('bit-depth-slider');
const downsampleSlider = document.getElementById('downsample-slider');
const gainSlider = document.getElementById('gain-slider');
const bitDepthValue = document.getElementById('bit-depth-value');
const downsampleValue = document.getElementById('downsample-value');
const gainValue = document.getElementById('gain-value');
const statusMessage = document.getElementById('status-message');

let audioContext;
let audioBuffer;
let sourceNode;
let workletNode;

const initAudioContext = async () => {
    if (!audioContext) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            await audioContext.audioWorklet.addModule('bitcrusher-processor.js');
        } catch (e) {
            console.error('Error initializing AudioContext:', e);
            statusMessage.textContent = 'Error: Web Audio API not supported.';
        }
    }
};

const setupAudioNodes = () => {
    if (sourceNode) {
        sourceNode.disconnect();
    }
    if (workletNode) {
        workletNode.disconnect();
    }

    sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = audioBuffer;

    workletNode = new AudioWorkletNode(audioContext, 'bitcrusher-processor');
    const gainNode = audioContext.createGain();

    const bitDepthParam = workletNode.parameters.get('bitDepth');
    const downsampleFactorParam = workletNode.parameters.get('downsampleFactor');
    
    bitDepthParam.value = bitDepthSlider.value;
    downsampleFactorParam.value = downsampleSlider.value;
    gainNode.gain.value = gainSlider.value / 100;

    sourceNode.connect(workletNode);
    workletNode.connect(gainNode);
    gainNode.connect(audioContext.destination);

    sourceNode.onended = () => {
        playBtn.disabled = false;
        stopBtn.disabled = true;
        statusMessage.textContent = "Playback finished. Press PLAY to hear it again.";
    };
};

fileInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) {
        return;
    }
    fileNameDisplay.textContent = file.name;
    statusMessage.textContent = 'Loading audio...';
    
    await initAudioContext();

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            audioBuffer = await audioContext.decodeAudioData(e.target.result);
            statusMessage.textContent = 'Audio loaded. Ready to play!';
            enableControls();
            updateDownloadLink();
        } catch (err) {
            statusMessage.textContent = 'Error decoding audio file.';
            console.error(err);
        }
    };
    reader.readAsArrayBuffer(file);
});


playBtn.addEventListener('click', () => {
    if (!audioContext || !audioBuffer) return;
    
    // Resume context if it's suspended
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    setupAudioNodes();
    sourceNode.start(0);
    playBtn.disabled = true;
    stopBtn.disabled = false;
    statusMessage.textContent = "Playing...";
});

stopBtn.addEventListener('click', () => {
    if (sourceNode) {
        sourceNode.stop(0);
        sourceNode.disconnect(); // clean up
        sourceNode = null;
    }
    playBtn.disabled = false;
    stopBtn.disabled = true;
    statusMessage.textContent = "Playback stopped.";
});

const updateEffectParams = () => {
    if (workletNode) {
        const bitDepthParam = workletNode.parameters.get('bitDepth');
        const downsampleFactorParam = workletNode.parameters.get('downsampleFactor');
        // Use setvalueAtTime for smoother transitions during playback
        bitDepthParam.setValueAtTime(bitDepthSlider.value, audioContext.currentTime);
        downsampleFactorParam.setValueAtTime(downsampleSlider.value, audioContext.currentTime);
    }
    bitDepthValue.textContent = bitDepthSlider.value;
    downsampleValue.textContent = downsampleSlider.value;
    updateDownloadLink();
};

const updateGain = () => {
    if(workletNode) {
        // Assume gain is the next node in the chain
        const gainNode = workletNode.connectedTo[0];
        if(gainNode && gainNode instanceof GainNode) {
             gainNode.gain.setValueAtTime(gainSlider.value / 100, audioContext.currentTime);
        }
    }
    gainValue.textContent = gainSlider.value;
};

bitDepthSlider.addEventListener('input', updateEffectParams);
downsampleSlider.addEventListener('input', updateEffectParams);
gainSlider.addEventListener('input', updateGain);

const enableControls = () => {
    playBtn.disabled = false;
    bitDepthSlider.disabled = false;
    downsampleSlider.disabled = false;
    gainSlider.disabled = false;
};

const updateDownloadLink = async () => {
    if (!audioBuffer) return;
    downloadLink.style.display = 'none';
    statusMessage.textContent = 'Processing for download...';
    
    try {
        const settings = {
            bitDepth: bitDepthSlider.value,
            downsampleFactor: downsampleSlider.value,
            gain: gainSlider.value / 100,
        };

        const processedWav = await renderOffline(audioBuffer, settings);
        const blob = new Blob([processedWav], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        
        downloadLink.href = url;
        const originalFileName = fileNameDisplay.textContent.split('.').slice(0, -1).join('.');
        downloadLink.download = `${originalFileName}_gameboy.wav`;
        downloadLink.style.display = 'inline-block';
        statusMessage.textContent = 'Ready for download or playback.';

    } catch (e) {
        console.error("Failed to render offline:", e);
        statusMessage.textContent = 'Error creating download file.';
    }
};

// Simple hack to get connected nodes for gain control.
// A more robust solution would manage the node graph explicitly.
Object.defineProperty(AudioNode.prototype, 'connectedTo', {
    value: [],
    writable: true,
    configurable: true
});

const originalConnect = AudioNode.prototype.connect;
AudioNode.prototype.connect = function() {
    this.connectedTo.push(arguments[0]);
    return originalConnect.apply(this, arguments);
};

