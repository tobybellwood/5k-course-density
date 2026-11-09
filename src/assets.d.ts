declare module '*.png' {
  const assetUrl: string;
  export default assetUrl;
}

declare module '*.mjs?worker&url' {
  const workerUrl: string;
  export default workerUrl;
}
