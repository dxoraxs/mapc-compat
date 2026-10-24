import { definePlugin } from '@steambrew/client';
import { startObserver } from './ui/observer';
import { Settings } from './ui/settings';

export default definePlugin(() => {
  const stop = startObserver();
  console.log('[mapc-compat] plugin loaded');
  return {
    title: 'MaPC compat',
    icon: null,
    content: <Settings />,
    onDismount: stop,
  };
});
