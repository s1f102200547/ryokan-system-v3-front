// src/GuestInfoEditable/CollapsibleSection.jsx
import React from 'react';
import { ListItemButton, ListItemText, Collapse } from '@mui/material';
 import { ExpandLess, ExpandMore } from '@mui/icons-material';

 export default function CollapsibleSection({
   label,
   open,
   onToggle,
   children,
 }) {
   return (
     <>
      <ListItemButton
        dense
        onClick={onToggle}
        disableRipple           // ← ripple を消す
      sx={{ py: 0.5 }}
      >
         <ListItemText
           primary={label}
           primaryTypographyProps={{ fontSize: '0.75rem' }}
         />
              {open ? (
          <ExpandLess
            fontSize="small"
            sx={{ color: 'text.disabled', opacity: 0.6 }}
          />
        ) : (
          <ExpandMore
            fontSize="small"
            sx={{ color: 'text.disabled', opacity: 0.6 }}
          />
        )}
       </ListItemButton>

       <Collapse in={open} timeout="auto" unmountOnExit>
         {children}
       </Collapse>
     </>
   );
}
