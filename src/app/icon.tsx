import { ImageResponse } from 'next/og';

export const size = {
  width: 32,
  height: 32,
};

export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: 'center',
          background: '#111827',
          color: '#F9FAFB',
          display: 'flex',
          fontSize: 16,
          fontWeight: 600,
          height: '100%',
          justifyContent: 'center',
          width: '100%',
        }}
      >
        OW
      </div>
    ),
    {
      ...size,
    },
  );
}
