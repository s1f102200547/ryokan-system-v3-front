import { useEffect, useMemo } from 'react';
import { countryOptions } from '../../constants/reservationOptions';
import { useStaffNameSync } from './useStaffNameSync.js';

export function useCheckInAfterFields(localData, handleChange) {
  const {
    booking_site,
    a_tax_received,
    a_tax_received_by_staff_name,
    tax,
    country,
    check_in_staff_name,
  } = localData;

  const isChillnn = useMemo(
    () => (booking_site || '').toLowerCase() === 'chillnn',
    [booking_site]
  );

  useEffect(() => {
    if (!isChillnn) return;

    if (a_tax_received) handleChange('a_tax_received', false);
    if (a_tax_received_by_staff_name) handleChange('a_tax_received_by_staff_name', '');
  }, [isChillnn, a_tax_received, a_tax_received_by_staff_name, handleChange]);

  const numericTax = useMemo(() => Number(tax ?? 0), [tax]);
  const formattedTax = useMemo(
    () => (Number.isNaN(numericTax) ? '0' : numericTax.toLocaleString()),
    [numericTax]
  );

  const taxStatusLabel = '受け取り済み';

  const taxNotice = useMemo(() => {
    if (!isChillnn) return null;
    return `宿泊税${formattedTax}円の徴収は不要です（CHILLNN）`;
  }, [isChillnn, formattedTax]);

  const countryOption = useMemo(
    () => countryOptions.find(option => option.value === country) || null,
    [country]
  );

  const { handleCheckInStaffInput, handleTaxStaffChange } = useStaffNameSync(
    handleChange,
    check_in_staff_name
  );

  return {
    isChillnn,
    formattedTax,
    taxStatusLabel,
    taxNotice,
    countryOption,
    handleCheckInStaffInput,
    handleTaxStaffChange,
  };
}
