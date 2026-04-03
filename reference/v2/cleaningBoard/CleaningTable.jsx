// src/components/CleaningTable.jsx
import React from 'react';
import { rooms, amenities, unit, S } from '../utils/printConfig';
import { Th, Td } from './PrintHelpers';
import { parseDate, computeNights } from '../utils/dateUtils';

export default function CleaningTable({
  targetDate,
  specifiedReservations,
  pastReservations,
  futureReservations
}) {
  const nextDay = new Date(targetDate);
  nextDay.setDate(targetDate.getDate() + 1);

  return (
    <table style={{ ...S.table, fontSize: '1.4em' }}>
      <thead>
        <tr>
          <Th width={unit(2)}>Rooms</Th>
          <Th width={unit(7)}>伝達事項</Th>
          <Th width={unit(4)}>浴衣サイズ</Th>
          <Th width={unit(1)}>C/I</Th>
          <Th width={unit(1)}>連泊</Th>
          {amenities.map((a, i) => <Th key={i} width={unit(1)}>{a}</Th>)}
          <Th width={unit(10)}>清掃担当メモ</Th>
        </tr>
      </thead>
      <tbody>
        {rooms.map(roomNo => {
          let needRen = false;

          // 連表示判定: 過去・指定日
          [...specifiedReservations, ...pastReservations].forEach(res => {
            if (+res.room === +roomNo) {
              const co = parseDate(res.check_out_date);
              if (co > nextDay) needRen = true;
            }
          });

          // 未来予約：2泊以上
          futureReservations.forEach(res => {
            if (+res.room === +roomNo) {
              const nights = computeNights(res.check_in_date, res.check_out_date);
              if (nights >= 2) needRen = true;
            }
          });

          // C/I 表示ロジック
          const ciRes = specifiedReservations.find(r => +r.room === +roomNo);
          const ciFuture = futureReservations.find(r => +r.room === +roomNo);
          const ciDisplay = ciRes
            ? `${ciRes.adult_count}${ciRes.child_count > 0 ? `(${ciRes.child_count})` : ''}`
            : ciFuture
              ? `(${ciFuture.adult_count}${ciFuture.child_count > 0 ? `(${ciFuture.child_count})` : ''})`
              : '';

          // 連泊人数
          const stayRes = pastReservations.find(r => +r.room === +roomNo);
          const stayText = stayRes
            ? `${stayRes.adult_count}${stayRes.child_count > 0 ? `(${stayRes.child_count})` : ''}`
            : '';

          return (
            <tr key={roomNo}>
              <Td width={unit(2)}>{roomNo}</Td>
              <Td width={unit(7)}>{needRen && <span style={{ fontSize: '1.2em', lineHeight: 1 }}>連</span>}</Td>
              <Td width={unit(4)} />
              <Td width={unit(1)}>{ciDisplay && <span style={{ fontSize: '1.2em', lineHeight: 1 }}>{ciDisplay}</span>}</Td>
              <Td width={unit(1)}>{stayText && <span style={{ fontSize: '1.2em', lineHeight: 1 }}>{stayText}</span>}</Td>
              {amenities.map((_, i) => <Td key={i} width={unit(1)} />)}
              <Td width={unit(10)} />
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
