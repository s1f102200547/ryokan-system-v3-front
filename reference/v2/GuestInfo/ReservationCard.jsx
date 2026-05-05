// src/components/ReservationCard.jsx
import React, {
  forwardRef,
  useState,
  useEffect,
  useRef,
  useImperativeHandle,
  useCallback,
  useMemo
} from 'react';
import { Box, Fade } from '@mui/material';
import ReservationCardSet1 from './ReservationCardSet1';
import ReservationCardSet2 from './ReservationCardSet2';
import { normalizeDinnerTime } from '../utils/normalizeDinnerTime';

// 配列生成ヘルパー
function createArray(value, length, defaultValue = null) {
  return Array.from({ length }, (_, i) =>
    Array.isArray(value)
      ? (value[i] !== undefined ? value[i] : defaultValue)
      : defaultValue
  );
}

// reservation → localData マッピング
function buildLocalData(res, nights) {
  return {
    reservation_number: res.reservation_number || res.id || '',
    booking_site: res.booking_site || '',
    check_in_date: res.check_in_date || '',
    check_out_date: res.check_out_date || '',
    guest_name: res.guest_name || '',
    room: res.room || '',
    adult_count: res.adult_count ?? '',
    child_count: res.child_count ?? '',
    country: res.country || '',
    city: res.city || '',
    group_type: res.group_type || '',
    check_in_staff_name: res.check_in_staff_name || '',
    purpose: res.purpose || '',
    tourism_type: res.tourism_type || '',
    profession: res.profession || '',
    knowledge_source: res.knowledge_source || '',
    knowledge_other: res.knowledge_other || '',
    previous_tokyo_hotels: res.previous_tokyo_hotels || '',
    other_note: res.other_note || '',
    arrival_time: res.arrival_time || null,
    late_out: res.late_out || 0,
    communication_note: res.communication_note || '',
    a_tax_received: res.a_tax_received ?? false,
    tax: res.tax ?? 0,
    a_tax_received_by_staff_name: res.a_tax_received_by_staff_name || '',
    age_groups: createArray(res.age_groups, res.adult_count || 0, ''),
    dinner_time: normalizeDinnerTime(res, nights),
    dinner_info: createArray(res.dinner_info, nights, ''),
    open_air_bath_time: createArray(res.open_air_bath_time, nights),
    breakfast_time: createArray(res.breakfast_time, nights),
    timetable_info: createArray(res.timetable_info, nights, ''),
    mail_memo:       res.mail_memo || [],
  };
}

const ReservationCard = forwardRef(({
  reservation,
  nights,
  currentTab,
  onFieldChange,
  onDirtyChange
}, ref) => {
  // 初期データ生成
  const initialData = useMemo(
    () => buildLocalData(reservation, nights),
    [reservation, nights]
  );
  const [localData, setLocalData] = useState(initialData);
  const initialRef = useRef(initialData);

  // reset
  useEffect(() => {
    initialRef.current = initialData;
    setLocalData(initialData);
  }, [initialData]);

  // dirty check
  useEffect(() => {
    const dirty = JSON.stringify(initialRef.current) !== JSON.stringify(localData);
    onDirtyChange && onDirtyChange(dirty);
  }, [localData, onDirtyChange]);

  // expose API
  useImperativeHandle(ref, () => ({
    getUpdatedData: () => ({ ...localData }),
    getDirtyFields: () =>
      Object.keys(localData).filter(
        key =>
          JSON.stringify(initialRef.current[key]) !== JSON.stringify(localData[key])
      ),
  }), [localData]);

  // 単一フィールド更新
  const handleChange = useCallback((field, value) => {
    setLocalData(prev => {
      if (field === 'adult_count') {
        const count = Number(value);
        const newArr = Array.from({ length: count }, (_, i) => prev.age_groups[i] || '');
        return { ...prev, adult_count: count, age_groups: newArr };
      }
      return { ...prev, [field]: value };
    });
    onFieldChange && onFieldChange(field, value);
  }, [onFieldChange]);

  // 配列フィールド更新
  const handleArrayChange = useCallback((field, idx, value) => {
    setLocalData(prev => {
      // 1) 前回の配列をコピー
      const arr = [...(prev[field] || [])];
      // 2) 指定インデックスを更新
      arr[idx] = value;
      // 3) 親に最新の配列全体を渡す
      if (onFieldChange) {
        onFieldChange(field, arr, idx);
      }
      // 4) ローカルステートを更新
      return { ...prev, [field]: arr };
    });
  }, [onFieldChange]);

  // late_out 用
const handleLateOut = useCallback(val => {
  handleChange('late_out', Number(val));
}, [handleChange]);

  return (
    <Box sx={{ position: 'relative' }}>
      <Fade
        in={currentTab === 0}
        timeout={250}
        mountOnEnter
        unmountOnExit
      >
        <Box>
          <ReservationCardSet1
            localData={localData}
            nights={nights}
            handleChange={handleChange}
            handleArrayChange={handleArrayChange}
            handleLateOut={handleLateOut}
          />
        </Box>
      </Fade>
      <Fade
        in={currentTab === 1}
        timeout={250}
        mountOnEnter
        unmountOnExit
      >
        <Box>
          <ReservationCardSet2
            localData={localData}
            handleChange={handleChange}
            handleArrayChange={handleArrayChange}
          />
        </Box>
      </Fade>
    </Box>
  );
});

export default ReservationCard;
