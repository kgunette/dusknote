// pdfmake ships its own types for the main entry, but we import the browser build path
// directly. A permissive shim keeps the call sites honest without pulling in @types/pdfmake.
declare module 'pdfmake/build/pdfmake' {
  const pdfMake: {
    vfs: Record<string, string>;
    fonts: Record<string, Record<string, string>>;
    createPdf: (doc: unknown) => { getBlob: (cb: (blob: Blob) => void) => void };
  };
  export default pdfMake;
}
