import express from 'express'
import {getAllConversation, createConservastion, getConversation, deleteConversation, createConversationMessage} from '../controllers/conversationController.js'

export const conversationRouter = express.Router()
conversationRouter.get('/conversations',getAllConversation)
conversationRouter.post('/conversations', createConservastion)
conversationRouter.get('/conversations/:id', getConversation)
conversationRouter.delete('/conversations/:id', deleteConversation)
conversationRouter.post('/conversations/:id/messages', createConversationMessage)

