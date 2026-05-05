import { memo, useCallback } from 'react';
import { Divider, Box } from '@mui/material';
import { TaxSection, MarketingSection } from './ReservationCardSet2.sections.jsx';
import { useCheckInAfterFields } from './hooks/useCheckInAfterFields.js';

function ReservationCardSet2({
  localData,
  handleChange,
  handleArrayChange,
}) {
  const {
    check_in_staff_name,
    city,
    age_groups,
    group_type,
    purpose,
    tourism_type,
    profession,
    other_note,
    a_tax_received,
    a_tax_received_by_staff_name,
  } = localData;

  const {
    isChillnn,
    formattedTax,
    taxStatusLabel,
    taxNotice,
    countryOption,
    handleCheckInStaffInput,
    handleTaxStaffChange,
  } = useCheckInAfterFields(localData, handleChange);

  const handleTaxToggle = useCallback(
    (value) => handleChange('a_tax_received', value),
    [handleChange]
  );

  const handleCountryChange = useCallback(
    (value) => handleChange('country', value),
    [handleChange]
  );

  const handleCityChange = useCallback(
    (value) => handleChange('city', value),
    [handleChange]
  );

  const handleAgeGroupChange = useCallback(
    (idx, value) => handleArrayChange('age_groups', idx, value),
    [handleArrayChange]
  );

  const handleGroupTypeChange = useCallback(
    (value) => handleChange('group_type', value),
    [handleChange]
  );

  const handlePurposeChange = useCallback((value) => {
    handleChange('purpose', value);
    if (value !== 'tourism') handleChange('tourism_type', '');
    if (value !== 'business') handleChange('profession', '');
  }, [handleChange]);

  const handleTourismTypeChange = useCallback(
    (value) => handleChange('tourism_type', value),
    [handleChange]
  );

  const handleProfessionChange = useCallback(
    (value) => handleChange('profession', value),
    [handleChange]
  );

  const handleOtherNoteChange = useCallback(
    (value) => handleChange('other_note', value),
    [handleChange]
  );

  const shouldShowGroupType = age_groups.length >= 2;
  const showTourismDetail = purpose === 'tourism';
  const showProfessionField = purpose === 'business';

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        mt: 1,
      }}
    >
      <TaxSection
        isChillnn={isChillnn}
        formattedTax={formattedTax}
        taxStatusLabel={taxStatusLabel}
        taxNotice={taxNotice}
        taxReceived={a_tax_received}
        onTaxToggle={handleTaxToggle}
        taxStaffName={a_tax_received_by_staff_name}
        onTaxStaffNameChange={handleTaxStaffChange}
      />

      <Divider sx={{ my: 0.5 }} />

      <MarketingSection
        checkInStaffName={check_in_staff_name}
        onCheckInStaffNameChange={handleCheckInStaffInput}
        countryOption={countryOption}
        onCountryChange={handleCountryChange}
        city={city}
        onCityChange={handleCityChange}
        ageGroups={age_groups}
        onAgeGroupChange={handleAgeGroupChange}
        shouldShowGroupType={shouldShowGroupType}
        groupType={group_type}
        onGroupTypeChange={handleGroupTypeChange}
        purpose={purpose}
        onPurposeChange={handlePurposeChange}
        showTourismDetail={showTourismDetail}
        tourismType={tourism_type}
        onTourismTypeChange={handleTourismTypeChange}
        showProfessionField={showProfessionField}
        profession={profession}
        onProfessionChange={handleProfessionChange}
        otherNote={other_note}
        onOtherNoteChange={handleOtherNoteChange}
      />
    </Box>
  );
}

export default memo(ReservationCardSet2);
