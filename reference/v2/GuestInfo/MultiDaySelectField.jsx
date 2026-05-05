import React from 'react';
import SelectField from './SelectField';

export default function MultiDaySelectField({
  label="",
  keyName,
  nights,
  values,
  onChange,
  options,
  menuProps,
  allowUnspecified = true,
}) {
  return (
    <>
      {Array.from({ length: nights }).map((_, i) => (
        <SelectField
          key={i}
          label={`${label} Day ${i + 1}`}
          value={values[i] ?? ''}
          onChange={val => onChange(keyName, i, val)}
          options={options}
          menuProps={menuProps}
          allowUnspecified={allowUnspecified}
        />
      ))}
    </>
  );
}
