// src/TimeTable.js
import React, { useMemo, useState, useEffect } from 'react';
import {
  Box,
  Button,
  GlobalStyles,
  Typography,
  TextField,
} from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import jaLocale from 'date-fns/locale/ja';

import CheckInTime from './CheckInTime';
import OpenAirBathEvening from './OpenAirBathEvening';
import NumberOfBreakfast from './NumberOfBreakfast';
import Dinner from './Dinner';
import GuestInfo from './GuestInfo';
import Header from './Breakfast/Header';
import Breakfast from './Breakfast/Breakfast';
import OpenAirBathMorning from './OpenAirBathMorning';
import CheckOutTime from './CheckOutTime';
import CheckoutNotice from './CheckoutNotice';

import { useReservations } from '../hooks/useReservationsRangeaBefore20After5';
import { useArrivalDict } from '../utils/useArrivalDict';
import { useStayStatus } from '../utils/useStayStatus';
import { useMultiNightGuests } from '../utils/useMultiNightGuests';
import { useCheckOutNextDayRooms } from '../utils/useCheckOutNextDayRooms';
import { useLateOutRooms } from '../utils/useLateOutRooms';
import { useOpenAirBathEvening } from '../utils/useOpenAirBathEvening';
import { useDinnerTime } from '../utils/useDinnerTime';
import { useBreakfastTime } from '../utils/useBreakfastTime';
import { useOpenAirBathMorning } from '../utils/useOpenAirBathMorning';

export default function TimeTable({ selectedDate, setSelectedDate }) {
  // 日付ラベル "M/D (曜)"
  const dateLabel = useMemo(() => {
    const m = selectedDate.getMonth() + 1;
    const d = selectedDate.getDate();
    const wd = ['日','月','火','水','木','金','土'][selectedDate.getDay()];
    return `${m}/${d} (${wd})`;
  }, [selectedDate]);

  // 翌日
  const nextDate = useMemo(() => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    return d;
  }, [selectedDate]);

  // ‥‥「月/日」形式にフォーマットしたラベルを用意
 const nextDateLabel = useMemo(() => {
   const m = nextDate.getMonth() + 1;
   const d = nextDate.getDate();
   return `${m}/${d}`;
 }, [nextDate]);

  // 予約取得
  const {
    specifiedReservations,
    pastReservations,
    futureReservations,
    loading,
    error,
  } = useReservations(selectedDate);

  const allReservations = useMemo(
    () => [...specifiedReservations, ...pastReservations],
    [specifiedReservations, pastReservations]
  );

  // 各種マップ
  const arrivalDict        = useArrivalDict(specifiedReservations);
  const stayStatus         = useStayStatus(allReservations, selectedDate);
  const multiNightStr      = useMultiNightGuests(allReservations, selectedDate);
  const nextDayCheckOutStr = useCheckOutNextDayRooms(allReservations, nextDate);
  const lateOutRooms       = useLateOutRooms(allReservations, nextDate);
  const openAirBathEvening = useOpenAirBathEvening(allReservations, selectedDate);
  const openAirBathMorning = useOpenAirBathMorning(allReservations, selectedDate);
  const dinnerMap          = useDinnerTime(allReservations, selectedDate);
  const breakfastMap       = useBreakfastTime(allReservations, selectedDate);
  const [printTime, setPrintTime] = useState(null);
  const [isPrinting, setIsPrinting] = useState(false);

  // ボタンをクリックしたときに「日時をセットしてから印刷を開始する」フローを作る
  const handlePrintClick = () => {
    // 1. 印刷日時をセット
    setPrintTime(new Date());
    // 2. このフラグを true にして、次のレンダー後に印刷を実行する
    setIsPrinting(true);
  };

  // printTime と isPrinting が揃ったタイミングで window.print() を呼ぶ
  useEffect(() => {
    if (isPrinting && printTime) {
      window.print();
      // 印刷後はフラグをオフに戻す
      setIsPrinting(false);
    }
  }, [isPrinting, printTime]);

    return (
    <>
      <GlobalStyles
        styles={{
          /* 印刷時にブラウザが自動でつける余白をゼロにする */
          '@page': {
            margin: 0,
          },
          /* 印刷用スタイル */
          '@media print': {
            'html, body': {
              margin: 0,
              padding: 0,
            },
            'body *': {
              visibility: 'hidden',
            },
            '#printableArea, #printableArea *': {
              visibility: 'visible',
            },
            '#printableArea': {
              position: 'absolute',
              top: 10,
              left: 10,
              transform: 'scale(0.9, 0.9)',
            },
          },
        }}
      />

      {/* 印刷時は非表示 */}
      <Box sx={{ display: 'flex', mb: 2, position: "relative", left: 30, '@media print': { display: 'none' } }}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={jaLocale}>
          <DatePicker
            label="チェックイン日"
            value={selectedDate}
            onChange={(newDate) => newDate && setSelectedDate(newDate)}
            slots={{ textField: TextField }}
            slotProps={{
              textField: {
                size: 'small',
              },
            }}
          />
        </LocalizationProvider>
        <Button variant="contained" onClick={handlePrintClick} size="medium"                      // ボタンサイズを指定
  sx={{
    left: "20%",
     borderRadius: 8,                  // 角丸
     px: 2,                            // 水平方向のパディング
     py: 1,                          // 垂直方向のパディング
     minWidth: 90,
     height: 50,                    // 最小幅
     boxShadow: 1,                     // 小さめのシャドウ
     textTransform: 'none',            // すべて大文字を無効化
     fontWeight: 500,                  // 少し強調
     bgcolor: 'primary.main',          // 色をテーマの primary
     '&:hover': {
       bgcolor: 'primary.dark',        // ホバー時の色
       boxShadow: 3,                   // ホバー時はシャドウ強め
     },
   }}>
          印刷
        </Button>
      </Box>

      <Box id="printableArea" sx={{ width: '90%', mx: 'auto' }}>
        <Typography>{dateLabel}</Typography>
<Box display="flex" justifyContent="space-between" alignItems="center">
  {/* 左寄せ */}
  <Typography>
    {multiNightStr}
  </Typography>

  {/* 右寄せ */}
  <Typography>
    {(() => {
      const wd = selectedDate.getDay(); // 0=日曜,1=月曜...
      if (wd === 0) return '▢資源ごみ　▢ニゴウ情報送信　▢61布団';
      if (wd === 1) return '▢リネン発注　▢ニゴウ情報送信　▢61布団';
      return '▢ニゴウ情報送信　▢61布団';
    })()}
  </Typography>
</Box>
        {/* 以下タイムテーブルのグリッド配置 */}
        <Box
          component="section"
          sx={{
            display: 'grid',
            gridTemplateColumns: '2.5fr 5fr 2.5fr',
            gridTemplateAreas: `
              "checkin  checkin       checkin"
              "evening  evening       evening"
              "number   dinner        guestinfo"
              "header   header        guestinfo"
              "breakfast breakfast    guestinfo"
              "morning  morning       guestinfo"
              "checkout checkout      guestinfo"
            `,
          }}
        >
          <Box sx={{ gridArea: 'checkin' }}>
            <CheckInTime arrivalDict={arrivalDict} />
          </Box>
          <Box sx={{ gridArea: 'evening' }}>
            <OpenAirBathEvening eveningMap={openAirBathEvening} />
          </Box>
          <Box sx={{ gridArea: 'number' }}>
            <NumberOfBreakfast />
          </Box>
          <Box sx={{ gridArea: 'dinner' }}>
            <Dinner dinnerMap={dinnerMap} />
          </Box>
          <Box sx={{ gridArea: 'guestinfo' }}>
            <GuestInfo stayStatus={stayStatus} />
          </Box>
          <Box sx={{ gridArea: 'header' }}>
            {nextDateLabel}
            <Header />
          </Box>
          <Box
            sx={{
              gridArea: 'breakfast',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Breakfast breakfastMap={breakfastMap} />
            <CheckoutNotice noticeText={nextDayCheckOutStr} />
          </Box>
          <Box sx={{ gridArea: 'morning' }}>
            <OpenAirBathMorning morningMap={openAirBathMorning} />
          </Box>
          <Box sx={{ gridArea: 'checkout' }}>
            <CheckOutTime lateOutStr={lateOutRooms} />
          </Box>
        </Box>
        <Box
          component="span"
          sx={{
            position: 'fixed',
            bottom: "5.8%",
            left: "-1.9%",
            fontSize: '10px',        // 必要に応じて他要素より前面に
          }}
        >
          露天
        </Box>
        <Box
          component="span"
          sx={{
            position: 'fixed',
            bottom: "1%",
            left: "-1.9%",
            fontSize: '10px',        // 必要に応じて他要素より前面に
          }}
        >
          C/O
        </Box>
{/* ─── ここが「印刷時に日時を表示する箇所」 ─── */}
        <Box
          component="span"
          sx={{
              // 通常表示では隠す
              display: 'none',
              // 印刷時にだけ表示する
              '@media print': {
                display: 'block',
              },
              position: 'fixed',
              top: '-3%',
              left: '-1.9%',
              fontSize: '10px',
            }}
        >
          {printTime
            ? // 「YYYY/MM/DD HH:MM」のように日本語ロケールで整形例
              printTime.toLocaleString('ja-JP', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              })
            : ''}
        </Box>
        {/* ──────────────────────────────────────────────── */}
      </Box>
    </>
  );
}
