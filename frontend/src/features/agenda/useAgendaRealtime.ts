import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { tokens } from '../../lib/api';

const EVENTS = ['agenda:appointment.created', 'agenda:appointment.updated', 'agenda:appointment.status'];

/**
 * Se suscribe a los cambios de la agenda por WebSocket (WSS detrás de Nginx). Con cada evento
 * llama a `onChange` (agrupando ráfagas) para que la pantalla vuelva a pedir los datos a la API,
 * donde se aplican los permisos.
 */
export function useAgendaRealtime(onChange: () => void) {
  const callback = useRef(onChange);
  useEffect(() => {
    callback.current = onChange;
  });

  useEffect(() => {
    const socket = io({
      path: '/ws',
      transports: ['websocket'],
      // función: en cada reconexión usa el token vigente
      auth: (done) => done({ token: tokens.access }),
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const notify = () => {
      clearTimeout(timer);
      timer = setTimeout(() => callback.current(), 250);
    };
    EVENTS.forEach((event) => socket.on(event, notify));
    // al reconectar se pudo perder algún evento
    socket.on('connect', notify);

    return () => {
      clearTimeout(timer);
      socket.close();
    };
  }, []);
}
