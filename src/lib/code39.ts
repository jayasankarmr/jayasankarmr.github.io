// Code 39 barcodes for the ticket backs: each ticket's number and date, encoded for real (it
// scans). Nine elements per character, alternating bar/space, three of them wide.
const TABLE: Record<string, string> = {
  "0": "000110100", "1": "100100001", "2": "001100001", "3": "101100000", "4": "000110001",
  "5": "100110000", "6": "001110000", "7": "000100101", "8": "100100100", "9": "001100100",
  A: "100001001", B: "001001001", C: "101001000", D: "000011001", E: "100011000", F: "001011000",
  G: "000001101", H: "100001100", I: "001001100", J: "000011100", K: "100000011", L: "001000011",
  M: "101000010", N: "000010011", O: "100010010", P: "001010010", Q: "000000111", R: "100000110",
  S: "001000110", T: "000010110", U: "110000001", V: "011000001", W: "111000000", X: "010010001",
  Y: "110010000", Z: "011010000", "-": "010000101", ".": "110000100", " ": "011000100", "*": "010010100",
};

/** Bars as [x, width] in module units (narrow = 1, wide = 2.5), plus the total width. */
export function code39(text: string) {
  const s = `*${text.toUpperCase().replace(/[^0-9A-Z. -]/g, "-")}*`;
  const bars: [number, number][] = [];
  let x = 0;
  for (const ch of s) {
    const p = TABLE[ch];
    for (let k = 0; k < 9; k++) {
      const w = p[k] === "1" ? 2.5 : 1;
      if (k % 2 === 0) bars.push([x, w]);
      x += w;
    }
    x += 1; // inter-character gap
  }
  return { bars, width: x - 1 };
}
