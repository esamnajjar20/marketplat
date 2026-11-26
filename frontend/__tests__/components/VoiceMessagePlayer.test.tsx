import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VoiceMessagePlayer } from '@/components/messages/VoiceMessagePlayer';

describe('VoiceMessagePlayer network usage', () => {
  it('does not request audio metadata until the user chooses to play', () => {
    const view = render(<VoiceMessagePlayer src="https://res.cloudinary.com/example/video/upload/voice.mp3" />);
    const audio = view.container.querySelector('audio');

    expect(audio).toHaveAttribute('preload', 'none');
    expect(audio).not.toHaveAttribute('autoplay');
    expect(screen.getByRole('button', { name: 'تشغيل التسجيل الصوتي' })).toBeEnabled();
  });
});
