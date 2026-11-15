import express from 'express'
import { registerUser, loginUser, logoutUser, getMe} from '../controllers/authControllers.js'

export const authRouter = express.Router()
authRouter.post('/register', registerUser)
authRouter.post('/login', loginUser)
authRouter.post('/logout', logoutUser)
authRouter.get('/me', getMe)


