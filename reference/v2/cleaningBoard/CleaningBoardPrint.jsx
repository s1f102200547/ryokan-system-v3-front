import React, { useMemo } from 'react';
import CleaningTable from './CleaningTable';
import CleaningFooter from './CleaningFooter';
import NotesSection from './NotesSection';
import { S } from '../utils/printConfig';
import { useReservations } from '../hooks/useReservationsRangeaBefore20After5';

export default function CleaningBoardPrint() {
  const targetDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  }, []);

  const headerDate = useMemo(() => {
    const m = targetDate.getMonth() + 1;
    const d = targetDate.getDate();
    const wk = ['日','月','火','水','木','金','土'][targetDate.getDay()];
    return `${m}月${d}日（${wk}）`;
  }, [targetDate]);

  const {
    specifiedReservations,
    pastReservations,
    futureReservations,
    loading,
    error,
  } = useReservations(targetDate);

  return (
    <>
      <style>{`${S.page}\n${S.printMedia}`}</style>
      <div style={S.container}>
        {/* 印刷時には隠す */}
        <button
          className="no-print"
          onClick={() => window.print()}
          style={S.button}
        >
          印刷
        </button>

        <div className="print-area">
          {/* エラーメッセージ表示（印刷時は非表示） */}
          {Array.isArray(error) && error.length > 0 && (
            <div
              className="no-print"
              style={{
                color: '#b00',
                backgroundColor: '#fee',
                padding: '8px',
                borderRadius: '4px',
                marginBottom: '12px',
                fontWeight: 'bold',
              }}
            >
              ⚠️ 以下の予約データに問題があります： {error.join(', ')}
            </div>
          )}

          <div style={S.dateHeader}>{headerDate}</div>

          <CleaningTable
            targetDate={targetDate}
            specifiedReservations={specifiedReservations}
            pastReservations={pastReservations}
            futureReservations={futureReservations}
          />

          <CleaningFooter />

          <NotesSection
            targetDate={targetDate}
            specifiedReservations={specifiedReservations}
            pastReservations={pastReservations}
            futureReservations={futureReservations}
          />
        </div>
      </div>
    </>
  );
}
