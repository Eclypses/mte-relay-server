export const mteFetchDefaults: {
  pairs: number;
  encodeType: "MTE" | "MKE";
  encodeUrl: boolean;
  encodeHeaders: boolean | string[];
} = {
  pairs: 5,
  encodeType: "MKE",
  encodeUrl: true,
  encodeHeaders: true,
};

export function setMteFetchDefaults(options: Partial<typeof mteFetchDefaults>) {
  Object.assign(mteFetchDefaults, options);
}
