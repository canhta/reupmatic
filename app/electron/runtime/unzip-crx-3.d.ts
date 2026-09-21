// `unzip-crx-3` ships no types; this is the single entry it exports (`module.exports = unzip`).
declare module 'unzip-crx-3' {
  function unzip(crxPath: string, destination: string): Promise<void>;
  export = unzip;
}
