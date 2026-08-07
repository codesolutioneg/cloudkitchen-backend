import { Request, Response } from 'express';
import { sendSuccess } from '../../core/utils/response';
import * as service from './assistant.service';

export async function chat(req: Request, res: Response): Promise<void> {
  const { message, history } = req.body as { message: string; history?: service.ChatMessage[] };
  sendSuccess(res, await service.chatWithAssistant(message, history ?? []));
}
