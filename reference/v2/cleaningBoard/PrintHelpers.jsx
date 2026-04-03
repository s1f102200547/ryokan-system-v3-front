// src/components/PrintHelpers.jsx
import React from 'react';
import { S } from '../utils/printConfig';

// テーブルヘッダーセル
export const Th = ({ width, children }) => (
  <th style={{ ...S.cell, ...S.headerCell, width }}>
    {children}
  </th>
);

// テーブルデータセル
export const Td = ({ width, children, style: extra }) => (
    <td style={{ ...S.cell, width, ...extra }}>
      {children}
    </td>
  );
