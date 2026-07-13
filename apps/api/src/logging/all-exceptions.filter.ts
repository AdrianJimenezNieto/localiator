import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

// pino-http augmenta el Request de Express con `id` (request-id) y `log` (el
// logger por-request, ya ligado a ese id). Los usamos para correlacionar el error
// con el resto de logs de la misma petición.

const SERVER_ERROR = 500; // umbral 5xx; comparar contra el enum HttpStatus dispara el lint de enums.

// Filtro GLOBAL de excepciones (tarea 08). Normaliza cualquier error:
//  - Lo registra con traza y contexto (ruta, método, request-id).
//  - Devuelve al cliente un mensaje seguro: el de la HttpException, o uno GENÉRICO
//    para errores no controlados (nunca detalles internos → coherente con tarea 05).
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    // Cuerpo de respuesta: para HttpException respetamos su payload (el frontend
    // lee `message`); para lo inesperado, mensaje genérico + request-id para soporte.
    const body = isHttp
      ? exception.getResponse()
      : {
          statusCode: status,
          message: 'Error interno del servidor',
          requestId: req.id,
        };

    // Log: los 5xx (bugs, caídas) van como error con traza; el resto como warn.
    // Usamos el logger de la request si está, para heredar el request-id.
    const logger = req.log;
    const meta = { method: req.method, url: req.url, statusCode: status };
    if (status >= SERVER_ERROR) {
      logger?.error({ ...meta, err: exception }, 'Excepción no controlada');
    } else {
      const message =
        exception instanceof Error ? exception.message : 'HttpException';
      logger?.warn({ ...meta }, message);
    }

    res.status(status).json(body);
  }
}
