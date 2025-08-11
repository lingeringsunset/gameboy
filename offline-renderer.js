/**
 * Renders an AudioBuffer offline with the given effects and returns a WAV file ArrayBuffer.
 */
export async function renderOffline(audioBuffer, settings) {
    const { bitDepth, downsampleFactor, gain } = settings;
    
    // Create an OfflineAudioContext with the same parameters as the original buffer
    const offlineContext = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        audioBuffer.length,
        audioBuffer.sampleRate
    );

    // Add the worklet module to the offline context
    await offlineContext.audioWorklet.addModule('bitcrusher-processor.js');

    // Create and configure nodes for the offline graph
    const sourceNode = offlineContext.createBufferSource();
    sourceNode.buffer = audioBuffer;

    const workletNode = new AudioWorkletNode(offlineContext, 'bitcrusher-processor');
    const bitDepthParam = workletNode.parameters.get('bitDepth');
    const downsampleFactorParam = workletNode.parameters.get('downsampleFactor');
    bitDepthParam.value = bitDepth;
    downsampleFactorParam.value = downsampleFactor;

    const gainNode = offlineContext.createGain();
    gainNode.gain.value = gain;

    // Connect the nodes
    sourceNode.connect(workletNode);
    workletNode.connect(gainNode);
    gainNode.connect(offlineContext.destination);

    // Start rendering
    sourceNode.start(0);
    const renderedBuffer = await offlineContext.startRendering();

    // Convert the rendered AudioBuffer to a WAV file (ArrayBuffer)
    return audioBufferToWav(renderedBuffer);
}


/**
 * Converts an AudioBuffer to a WAV file (ArrayBuffer).
 * This function handles the creation of the WAV file headers and interleaving the channel data.
 */
function audioBufferToWav(buffer) {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const ab = new ArrayBuffer(length);
    const view = new DataView(ab);
    const channels = [];
    let i, sample;
    let offset = 0;
    let pos = 0;

    // Write WAV container
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"

    // Write "fmt " chunk
    setUint32(0x20746d66); // "fmt "
    setUint32(16); // chunk size
    setUint16(1); // audio format 1 = PCM
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan); // byte rate
    setUint16(numOfChan * 2); // block align
    setUint16(16); // bits per sample

    // Write "data" chunk
    setUint32(0x61746164); // "data"
    setUint32(length - pos - 4);

    // Write interleaved data
    for (i = 0; i < buffer.numberOfChannels; i++) {
        channels.push(buffer.getChannelData(i));
    }

    while (pos < length) {
        for (i = 0; i < numOfChan; i++) {
            sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; // scale to 16-bit signed int
            view.setInt16(pos, sample, true); // write 16-bit sample
            pos += 2;
        }
        offset++;
    }

    return ab;

    function setUint16(data) {
        view.setUint16(pos, data, true);
        pos += 2;
    }

    function setUint32(data) {
        view.setUint32(pos, data, true);
        pos += 4;
    }
}

