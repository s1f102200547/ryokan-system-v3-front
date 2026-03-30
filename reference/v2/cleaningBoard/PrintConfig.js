// src/utils/printConfig.js

// レイアウト計算用
export const TOTAL_UNITS = 37;
export const unit = pct => `${(100 / TOTAL_UNITS * pct).toFixed(4)}%`;

// データ定義
export const rooms = ['21','22','31','32','42','43','52','53','54','61'];
export const amenities = [
  '清掃','布団','タオル2点','バスマット','シャンプー',
  '歯ブラシ等','水コップ','ティッシュ','ゴミ箱','掛け花',
  'トイレペーパ-','ライト(連泊)'
];
export const footerLeft = ['5Fトイレ','6Fトイレ','露天','共有シャワー','ヘアキャッチャー','各階廊下'];
export const footerRight = ['はがし','フロア清掃','水回り清掃','布団セット','アメニティセット'];

// スタイル共通定義
export const S = {
  page: `@page { size: A4 landscape; margin: 10mm }`,
  printMedia: `
    @media print {
      body * { visibility: hidden }
      .print-area, .print-area * { visibility: visible }
      .print-area { position: absolute; top:0; left:0; width:100% }
      .no-print { display: none !important }
    }
  `,
  container: { fontFamily: 'sans-serif', fontSize: '8pt', color: '#000' },
  dateHeader: {fontSize: '1.2em',textAlign: 'left',marginBottom: 6,},
  button: { marginBottom: 12, padding: '4px 8px', cursor: 'pointer' },
  table: { width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', borderSpacing: 0 },
  cell: { border: '0.5px solid #000', padding: '3px 1px', textAlign: 'center', verticalAlign: 'middle' },
  headerCell: { whiteSpace: 'normal', lineHeight: 1.2, padding: '10px 4px' },
  notesBox: { border: '0.5px solid #000', height: 90, width: '100%' },
  footerCenter: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9pt' },
};
