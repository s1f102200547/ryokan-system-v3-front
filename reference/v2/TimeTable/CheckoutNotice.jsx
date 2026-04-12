// src/components/CheckoutNotice.js
import Box from '@mui/material/Box';

export default function CheckoutNotice({ noticeText }) {
  return (
    <Box
      component="div"
      sx={{
        fontSize: '10px',
        whiteSpace: 'pre-wrap',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        position: "relative",
        top: "40px",
        left: "15px"
      }}
    >
      <strong>本日のチェックアウト</strong>
      <Box component="span" sx={{ mt: 0.5, fontSize: "13px" }}>
        {noticeText || 'なし'}
      </Box>
    </Box>
  );
}