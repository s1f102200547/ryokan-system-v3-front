import { useCallback, useRef } from 'react';
import { TAX_SYNC_WINDOW_MS } from '../ReservationCardSet2.constants.js';

export function useStaffNameSync(handleFieldChange, currentCheckInStaffName) {
  const syncWindowRef = useRef(null);
  const allowSyncRef = useRef(false);

  const handleCheckInStaffInput = useCallback((value, { fromSync = false } = {}) => {
    if (!fromSync) {
      allowSyncRef.current = false;
      syncWindowRef.current = null;
    }
    handleFieldChange('check_in_staff_name', value);
  }, [handleFieldChange]);

  const handleTaxStaffChange = useCallback((value) => {
    handleFieldChange('a_tax_received_by_staff_name', value);
    const trimmed = value.trim();
    const now = Date.now();

    if (allowSyncRef.current && syncWindowRef.current && now > syncWindowRef.current) {
      allowSyncRef.current = false;
      syncWindowRef.current = null;
    }

    if (!allowSyncRef.current && !currentCheckInStaffName?.trim() && trimmed) {
      allowSyncRef.current = true;
      syncWindowRef.current = now + TAX_SYNC_WINDOW_MS;
    }

    const withinWindow =
      allowSyncRef.current &&
      syncWindowRef.current &&
      now <= syncWindowRef.current;

    if (withinWindow) {
      handleCheckInStaffInput(value, { fromSync: true });
    }
  }, [handleFieldChange, currentCheckInStaffName, handleCheckInStaffInput]);

  return { handleCheckInStaffInput, handleTaxStaffChange };
}
