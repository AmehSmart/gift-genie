import bcrypt from 'bcryptjs'
import db from  '../db.js'

export async function registerUser(req, res) {
      const { name, username, password } = req.body ?? {};

  if (
    typeof name !== "string" ||
    typeof username !== "string" ||
    typeof password !== "string"
  ) {
    return res.status(400).json({
      error: { message: "Name, username, and password are required." },
    });
  }

  const cleanName = name.trim();
  const cleanUsername = username.trim().toLowerCase();

  if (!cleanName || cleanUsername.length < 3 || password.length < 8) {
    return res.status(400).json({
      error: { message: "Enter a name, a username of at least 3 characters, and a password of at least 8 characters." },
    });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await db.run(
      "INSERT INTO users (name, username, password_hash) VALUES (?, ?, ?)",
      [cleanName, cleanUsername, passwordHash]
    );

    const user = {
      id: Number(result.lastInsertRowid),
      name: cleanName,
      username: cleanUsername,
    };

    req.session.userId = user.id;
    return res.status(201).json({ user });
  } catch (error) {
    if (
  error.code === "SQLITE_CONSTRAINT" ||
        error.message?.includes("UNIQUE constraint failed")
      ) {
        return res.status(409).json({
          error: {
            message: "That username is already registered.",
          },
        });
      }
    console.error("Registration failed:", error);
    return res.status(500).json({
      error: { message: "Registration failed. Please try again." },
    });
  }

}


export async function getMe(req, res){
  if (!req.session.userId) {
    return res.status(401).json({
      error: { message: "You are not signed in." },
    });
  }

  try {
    const user = await db.get(
      "SELECT id, name, username FROM users WHERE id = ?",
      [req.session.userId]
    );

    if (!user) {
      return res.status(401).json({
        error: { message: "You are not signed in." },
      });
    }

    return res.json({ user });
  } catch (error) {
    console.error("Could not load the signed-in user:", error);
    return res.status(500).json({
      error: { message: "Could not check your sign-in status." },
    });
  }
}

// ===== New loginUser function =====
export async function loginUser(req, res){
    const { username, password } = req.body ?? {};

  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({
      error: { message: "Username and password are required." },
    });
  }

  try {
    const cleanUsername = username.trim().toLowerCase();
    const user = await db.get(
      "SELECT id, name, username, password_hash FROM users WHERE username = ?",
      [cleanUsername]
    );

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({
        error: { message: "Invalid username or password." },
      });
    }

    await new Promise((resolve, reject) => {
      req.session.regenerate((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    req.session.userId = user.id;
    return res.json({
      user: { id: user.id, name: user.name, username: user.username },
    });
  } catch (error) {
    console.error("Login failed:", error);
    return res.status(500).json({
      error: { message: "Login failed. Please try again." },
    });
  }
   }


   
export async function logoutUser(req, res) {
      req.session.destroy((error) => {
    if (error) {
      console.error("Logout failed:", error);
      return res.status(500).json({
        error: { message: "Could not sign out. Please try again." },
      });
    }

    res.clearCookie("connect.sid", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return res.status(204).end();
  })
}




