// utils function to concat two Uint8Arrays into new Uint8Array
export function concatTwoUint8Arrays(arr1: Uint8Array, arr2: Uint8Array) {
  const newBuffer = new Uint8Array(arr1.length + arr2.length);
  newBuffer.set(arr1);
  newBuffer.set(arr2, arr1.length);
  return newBuffer;
}
