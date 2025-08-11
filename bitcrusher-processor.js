class BitcrusherProcessor extends AudioWorkletProcessor {
  
  constructor() {
    super();
    this.phase = 0;
    this.lastSampleValue = 0;
  }

  static get parameterDescriptors() {
    return [
      {
        name: 'bitDepth',
        defaultValue: 8,
        minValue: 1,
        maxValue: 16,
        automationRate: 'k-rate'
      },
      {
        name: 'downsampleFactor',
        defaultValue: 1,
        minValue: 1,
        maxValue: 100,
        automationRate: 'k-rate'
      }
    ];
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    const bitDepth = parameters.bitDepth[0];
    const downsampleFactor = Math.max(1, Math.floor(parameters.downsampleFactor[0]));

    // Number of discrete steps based on bit depth
    // 2^bitDepth gives the number of levels
    const steps = Math.pow(2, bitDepth);

    for (let channel = 0; channel < input.length; ++channel) {
      const inputChannel = input[channel];
      const outputChannel = output[channel];
      
      for (let i = 0; i < inputChannel.length; ++i) {
        // --- Downsampling ---
        // Hold the sample for 'downsampleFactor' number of frames
        this.phase++;
        if (this.phase % downsampleFactor === 0) {
            this.lastSampleValue = inputChannel[i];
            this.phase = 0;
        }

        const currentSample = this.lastSampleValue;

        // --- Bitcrushing ---
        // 1. Normalize sample from [-1, 1] to [0, 1]
        const normalizedSample = (currentSample + 1) / 2;
        // 2. Quantize to the number of steps
        const quantized = Math.floor(normalizedSample * steps);
        // 3. De-quantize back to [0, 1]
        const dequantized = quantized / (steps - 1);
        // 4. Denormalize back to [-1, 1]
        outputChannel[i] = dequantized * 2 - 1;
      }
    }
    
    // Keep processor alive
    return true;
  }
}

registerProcessor('bitcrusher-processor', BitcrusherProcessor);

