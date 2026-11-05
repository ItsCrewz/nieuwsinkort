export const MAIN = "@cf/google/gemma-4-26b-a4b-it", SMALL = "@cf/meta/llama-3.2-1b-instruct";
export const LLAMA_3B = "@cf/meta/llama-3.2-3b-instruct";
export const RATES: Record<string, [number, number]> = { // neuronen per 1M tokens [in, uit]
  [MAIN]: [9091, 27273],
  [SMALL]: [2457, 18252],
  [LLAMA_3B]: [4625, 30475],
  "@cf/qwen/qwen3-30b-a3b-fp8": [4625, 30475],
  "@cf/meta/llama-3.1-8b-instruct-fp8-fast": [4119, 34868],
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast": [26668, 204805],
  "@cf/mistralai/mistral-small-3.1-24b-instruct": [31876, 50488],
};
