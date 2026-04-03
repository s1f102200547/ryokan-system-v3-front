// src/components/CleaningFooter.jsx
import React from 'react';
import { footerLeft, footerRight, S } from '../utils/printConfig';
import { Td } from './PrintHelpers';

export default function CleaningFooter() {
  // フッター用にパディングを絞るスタイル
  const footCellStyle = { padding: '4px 2px' };

  return (
    <div style={{ display: 'flex', width: '100%', marginTop: 12, gap: 8 }}>
      <table style={{ ...S.table, width: '30%' }}>
        <tbody>
          {footerLeft.map((label, i) => (
            <tr key={i}>
              <Td width="35%" style={footCellStyle}>{label}</Td>
              <Td style={footCellStyle} />
            </tr>
          ))}
        </tbody>
      </table>
      <div style={S.footerCenter}>
        露天スイッチ → <span style={{ fontSize: '3em', display: 'inline-block' }}>□</span>
      </div>
      <table style={{ ...S.table, width: '30%' }}>
        <tbody>
          {footerRight.map((label, i) => (
            <tr key={i}>
              <Td width="35%" style={footCellStyle}>{label}</Td>
              <Td style={footCellStyle} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
