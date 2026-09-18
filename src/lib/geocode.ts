const CJK = /[぀-ヿ㐀-䶿一-鿿]/;

// Two CJK characters (京都, 北京) are a complete query; Latin needs three.
export function isGeocodableQuery(q: string) {
  const s = q.trim();
  return s.length >= (CJK.test(s) ? 2 : 3);
}
