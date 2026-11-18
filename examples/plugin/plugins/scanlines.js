const CHANNELS = 4;
const ALPHA = 3;

export default {
  apiVersion: 1,
  nodes: [
    {
      name: "scanlines",
      title: "Scanlines",
      inputs: { image: "image" },
      outputs: { image: "image" },
      params: {
        spacing: { kind: "integer", default: 2, min: 2, max: 32 },
        darkness: { kind: "number", default: 0.5, min: 0, max: 1, step: 0.05 },
      },
      process(inputs, params) {
        const { width, height, data } = inputs.image;
        const result = new Float32Array(data);
        for (let y = 0; y < height; y += params.spacing) {
          for (let x = 0; x < width; x++) {
            const offset = (y * width + x) * CHANNELS;
            for (let channel = 0; channel < ALPHA; channel++) {
              result[offset + channel] *= 1 - params.darkness;
            }
          }
        }
        return { image: { width, height, data: result } };
      },
    },
  ],
};
