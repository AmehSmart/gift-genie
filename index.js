import { marked } from "marked";
import DOMPurify from "dompurify";
import {
  ApiError,
  FriendlyError,
  authApi,
  conversationsApi,
  getFriendlyErrorMessage,
  guestApi,
  voiceApi,
} from "./api.js";
import { autoResizeTextarea, setLoading } from "./utils.js";

const authView = document.getElementById("auth-view");
const startupView = document.getElementById("startup-view");
const appShell = document.getElementById("app-shell");
const authTitle = document.getElementById("auth-title");
const authDescription = document.querySelector(".auth-description");
const authFeedback = document.getElementById("auth-feedback");
const authTabs = document.querySelectorAll("[data-auth-mode]");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const accountName = document.getElementById("account-name");
const logoutButton = document.getElementById("logout-button");
const guestButton = document.getElementById("guest-button");
const newConversationButton = document.getElementById("new-conversation");
const conversationList = document.getElementById("conversation-list");
const chatHeading = document.getElementById("chat-heading");
const chatFeedback = document.getElementById("chat-feedback");
const messageList = document.getElementById("message-list");
const mainContent = document.querySelector(".main-content");
const giftForm = document.getElementById("gift-form");
const userInput = document.getElementById("user-input");
const voiceButton = document.getElementById("voice-button");
const voiceStatus = document.getElementById("voice-status");
const historySidebar = document.getElementById("history-sidebar");
const historyToggle = document.getElementById("history-toggle");
const historyClose = document.getElementById("history-close");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");
const mobileLayout = window.matchMedia("(max-width: 760px)");

let currentUser = null;
let isGuestMode = false;
let activeConversationId = null;
let conversations = [];
let guestMessages = [];
let mediaRecorder = null;
let microphoneStream = null;
let recordedAudioChunks = [];
let recordingTimeout = null;
let voiceReplyPending = false;
let activeVoiceAudio = null;
let activeVoiceObjectUrl = null;
let stopActiveVoice = null;
const NEW_CONVERSATION = "__new__";

function start() {
  authTabs.forEach((tab) => {
    tab.addEventListener("click", () => setAuthMode(tab.dataset.authMode));
  });
  loginForm.addEventListener("submit", handleLogin);
  registerForm.addEventListener("submit", handleRegister);
  logoutButton.addEventListener("click", handleLogout);
  guestButton.addEventListener("click", enterGuestMode);
  voiceButton.addEventListener("click", handleVoiceButtonClick);
  newConversationButton.addEventListener("click", handleNewConversation);
  conversationList.addEventListener("click", handleConversationSelection);
  giftForm.addEventListener("submit", handleGiftRequest);
  userInput.addEventListener("input", () => autoResizeTextarea(userInput));
  historyToggle.addEventListener("click", () => {
    setHistorySidebarOpen(!historySidebar.classList.contains("is-open"));
  });
  historyClose.addEventListener("click", () => setHistorySidebarOpen(false));
  sidebarBackdrop.addEventListener("click", () => setHistorySidebarOpen(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && historySidebar.classList.contains("is-open")) {
      setHistorySidebarOpen(false);
    }
  });
  mobileLayout.addEventListener("change", (event) => {
    if (!event.matches && historySidebar.classList.contains("is-open")) {
      setHistorySidebarOpen(false, false);
    }
  });

  setAuthMode("login");
  initialize();
}

function setAuthMode(mode) {
  const isRegistering = mode === "register";
  loginForm.classList.toggle("hidden", isRegistering);
  registerForm.classList.toggle("hidden", !isRegistering);
  authTitle.textContent = isRegistering ? "Create your account" : "Welcome back";
  authDescription.textContent = isRegistering
    ? "Create an account to keep your gift conversations together."
    : "Sign in to keep your gift conversations together.";

  authTabs.forEach((tab) => {
    const isActive = tab.dataset.authMode === mode;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });
  setFeedback(authFeedback, "");
}

async function initialize() {
  try {
    const data = await authApi.currentUser();
    if (!data?.user) {
      throw new Error("The server returned an invalid sign-in response.");
    }
    startupView.classList.add("hidden");
    await enterApp(data.user);
  } catch (error) {
    startupView.classList.add("hidden");
    showAuthView();
    if (error instanceof ApiError && error.status === 401) {
      setFeedback(authFeedback, "");
    } else {
      setFeedback(authFeedback, getFriendlyErrorMessage(error, "login"), "error");
    }
  }
}

function showAuthView() {
  startupView.classList.add("hidden");
  authView.classList.remove("hidden");
  appShell.classList.add("hidden");
}

async function enterApp(user) {
  if (!user || typeof user !== "object") {
    throw new Error("The server did not return a valid user.");
  }

  isGuestMode = false;
  guestMessages = [];
  startupView.classList.add("hidden");
  appShell.classList.remove("guest-mode");
  logoutButton.textContent = "Sign out";
  currentUser = user;
  accountName.textContent = user.name || user.username || "Signed in";
  authView.classList.add("hidden");
  appShell.classList.remove("hidden");
  setFeedback(chatFeedback, "");

  try {
    await loadConversations();
    await restoreActiveConversation();
  } catch (error) {
    setFeedback(chatFeedback, getFriendlyErrorMessage(error, "history"), "error");
  }
}

function enterGuestMode() {
  currentUser = null;
  isGuestMode = true;
  activeConversationId = null;
  conversations = [];
  guestMessages = [];
  accountName.textContent = "Guest";
  logoutButton.textContent = "Sign in";
  appShell.classList.add("guest-mode");
  authView.classList.add("hidden");
  appShell.classList.remove("hidden");
  renderConversationList();
  renderMessages([]);
  chatHeading.textContent = "Guest chat (not saved)";
  setFeedback(chatFeedback, "");
  userInput.value = "";
  autoResizeTextarea(userInput);
  setHistorySidebarOpen(false, false);
}

async function handleLogin(event) {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const submitButton = loginForm.querySelector('button[type="submit"]');

  setFeedback(authFeedback, "");
  setFormBusy(submitButton, true, "Signing in...");

  try {
    const data = await authApi.login({
      username: String(formData.get("username") || "").trim(),
      password: String(formData.get("password") || ""),
    });
    await enterApp(data?.user);
  } catch (error) {
    setFeedback(authFeedback, getFriendlyErrorMessage(error, "login"), "error");
  } finally {
    setFormBusy(submitButton, false, "Sign in");
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const formData = new FormData(registerForm);
  const submitButton = registerForm.querySelector('button[type="submit"]');

  setFeedback(authFeedback, "");
  setFormBusy(submitButton, true, "Creating account...");

  try {
    const data = await authApi.register({
      name: String(formData.get("name") || "").trim(),
      username: String(formData.get("username") || "").trim(),
      password: String(formData.get("password") || ""),
    });
    await enterApp(data?.user);
    registerForm.reset();
  } catch (error) {
    setFeedback(authFeedback, getFriendlyErrorMessage(error, "register"), "error");
  } finally {
    setFormBusy(submitButton, false, "Create account");
  }
}

async function handleLogout() {
  if (isGuestMode) {
    currentUser = null;
    isGuestMode = false;
    activeConversationId = null;
    conversations = [];
    guestMessages = [];
    clearActiveVoiceAudio();
    messageList.replaceChildren();
    mainContent.classList.remove("has-messages");
    appShell.classList.remove("guest-mode");
    chatHeading.textContent = "Your personal gift-finding assistant";
    userInput.value = "";
    autoResizeTextarea(userInput);
    setHistorySidebarOpen(false, false);
    showAuthView();
    setAuthMode("login");
    return;
  }

  logoutButton.disabled = true;
  setFeedback(chatFeedback, "");

  try {
    await authApi.logout();
    currentUser = null;
    isGuestMode = false;
    activeConversationId = null;
    conversations = [];
    guestMessages = [];
    clearActiveVoiceAudio();
    messageList.replaceChildren();
    mainContent.classList.remove("has-messages");
    appShell.classList.remove("guest-mode");
    chatHeading.textContent = "Your personal gift-finding assistant";
    setHistorySidebarOpen(false, false);
    loginForm.reset();
    showAuthView();
    setAuthMode("login");
  } catch (error) {
    setHistorySidebarOpen(false);
    setFeedback(chatFeedback, getFriendlyErrorMessage(error, "logout"), "error");
  } finally {
    logoutButton.disabled = false;
  }
}

async function loadConversations() {
  const data = await conversationsApi.list();
  if (
    !Array.isArray(data?.conversations) ||
    !data.conversations.every(
      (conversation) =>
        conversation &&
        conversation.id !== undefined &&
        conversation.id !== null
    )
  ) {
    throw new Error("The server returned an invalid conversations list.");
  }

  conversations = data.conversations;
  renderConversationList();
}

function getActiveConversationStorageKey() {
  return `gift-genie-active-conversation:${currentUser.id}`;
}

function rememberActiveConversation(conversationId) {
  if (!currentUser) return;
  localStorage.setItem(
    getActiveConversationStorageKey(),
    conversationId === null ? NEW_CONVERSATION : String(conversationId)
  );
}

async function restoreActiveConversation() {
  const savedId = localStorage.getItem(getActiveConversationStorageKey());
  if (savedId === NEW_CONVERSATION) {
    activeConversationId = null;
    renderMessages([]);
    chatHeading.textContent = "New conversation";
    return;
  }

  const conversation =
    conversations.find((item) => String(item.id) === savedId) ??
    (savedId === null ? conversations[0] : null);

  if (!conversation) {
    if (savedId !== null) {
      localStorage.removeItem(getActiveConversationStorageKey());
    }
    activeConversationId = null;
    renderMessages([]);
    chatHeading.textContent = "Your personal gift-finding assistant";
    return;
  }

  await openConversation(conversation.id);
}

function renderConversationList() {
  conversationList.replaceChildren();

  if (conversations.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "history-placeholder";
    emptyMessage.textContent = "No conversations yet. Start a new one to get going.";
    conversationList.append(emptyMessage);
    return;
  }

  conversations.forEach((conversation) => {
    const row = document.createElement("div");
    row.className = "conversation-row";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "conversation-item";
    button.dataset.conversationId = String(conversation.id);
    const title = conversation.title || "Gift conversation";
    button.textContent = title;
    button.setAttribute(
      "aria-current",
      String(String(conversation.id) === String(activeConversationId))
    );

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "conversation-delete";
    deleteButton.dataset.deleteConversationId = String(conversation.id);
    deleteButton.setAttribute("aria-label", `Delete ${title}`);
    deleteButton.textContent = "Delete";

    row.append(button, deleteButton);
    conversationList.append(row);
  });
}

function upsertConversation(conversation) {
  const id = String(conversation.id);
  conversations = [
    conversation,
    ...conversations.filter((item) => String(item.id) !== id),
  ];
  renderConversationList();
}

function handleNewConversation() {
  setFeedback(chatFeedback, "");
  activeConversationId = null;
  rememberActiveConversation(null);
  renderMessages([]);
  renderConversationList();
  chatHeading.textContent = "New conversation";
  setHistorySidebarOpen(false);
}

async function handleConversationSelection(event) {
  const deleteButton = event.target.closest("[data-delete-conversation-id]");
  if (deleteButton && conversationList.contains(deleteButton)) {
    await handleConversationDelete(deleteButton);
    return;
  }

  const button = event.target.closest("[data-conversation-id]");
  if (!button || !conversationList.contains(button)) return;

  await openConversation(button.dataset.conversationId);
}

async function openConversation(conversationId) {
  activeConversationId = conversationId;
  rememberActiveConversation(conversationId);
  renderConversationList();
  setHistorySidebarOpen(false);
  renderMessages([]);
  chatHeading.textContent = "Loading conversation...";
  setFeedback(chatFeedback, "Loading conversation...");

  try {
    const data = await conversationsApi.get(conversationId);
    if (!data?.conversation || !Array.isArray(data.messages)) {
      throw new Error("The server returned an invalid conversation.");
    }

    upsertConversation(data.conversation);
    renderMessages(data.messages);
    chatHeading.textContent = data.conversation.title || "Gift conversation";
    setFeedback(chatFeedback, "");
  } catch (error) {
    setFeedback(chatFeedback, getFriendlyErrorMessage(error, "conversation"), "error");
  }
}

async function handleConversationDelete(button) {
  const conversationId = button.dataset.deleteConversationId;
  const conversation = conversations.find(
    (item) => String(item.id) === conversationId
  );
  if (!conversation) return;

  const title = conversation.title || "Gift conversation";
  // if (
  //   !window.confirm(
  //     `Delete "${title}"? This will permanently delete its messages.`
  //   )
  // ) {
  //   return;
  // }

  button.disabled = true;

  try {
    await conversationsApi.delete(conversationId);
    conversations = conversations.filter(
      (item) => String(item.id) !== conversationId
    );

    if (String(activeConversationId) === conversationId) {
      activeConversationId = null;
      rememberActiveConversation(null);
      renderMessages([]);
      chatHeading.textContent = "Your personal gift-finding assistant";
    }

    renderConversationList();
    setFeedback(chatFeedback, "Conversation deleted.");
  } catch (error) {
    setFeedback(chatFeedback, getFriendlyErrorMessage(error, "delete"), "error");
    button.disabled = false;
  }
}

function getGuestHistory() {
  const recentMessages = guestMessages.slice(-20);
  const history = [];
  let totalCharacters = 0;

  for (let index = recentMessages.length - 1; index >= 0; index -= 1) {
    const message = recentMessages[index];
    const remainingCharacters = 16000 - totalCharacters;
    if (remainingCharacters === 0) break;

    const content = message.content.slice(0, Math.min(4000, remainingCharacters));
    history.unshift({ role: message.role, content });
    totalCharacters += content.length;

    if (content.length < message.content.length) break;
  }

  return history;
}

async function handleVoiceButtonClick() {
  if (mediaRecorder?.state === "recording") {
    voiceButton.disabled = true;
    voiceButton.textContent = "Transcribing...";
    voiceButton.setAttribute("aria-label", "Processing voice recording");
    setFeedback(voiceStatus, "Finishing recording...");
    mediaRecorder.stop();
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    setFeedback(
      voiceStatus,
      "Voice recording isn't available in this browser. Try a different browser, and make sure the page is opened securely (HTTPS).",
      "error"
    );
    return;
  }

  voiceButton.disabled = true;
  userInput.disabled = true;
  giftForm.querySelector('button[type="submit"]').disabled = true;
  newConversationButton.disabled = true;
  logoutButton.disabled = true;
  setFeedback(voiceStatus, "Requesting microphone permission...");

  try {
    microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const supportedMimeType = [
      "audio/webm;codecs=opus",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ].find(
      (type) =>
        typeof MediaRecorder.isTypeSupported === "function" &&
        MediaRecorder.isTypeSupported(type)
    );
    mediaRecorder = supportedMimeType
      ? new MediaRecorder(microphoneStream, { mimeType: supportedMimeType })
      : new MediaRecorder(microphoneStream);

    const recorder = mediaRecorder;
    recordedAudioChunks = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) recordedAudioChunks.push(event.data);
    });
    recorder.addEventListener(
      "stop",
      () => {
        void finishVoiceRecording(recorder);
      },
      { once: true }
    );
    recorder.start();
    userInput.disabled = true;
    giftForm.querySelector('button[type="submit"]').disabled = true;
    voiceButton.disabled = false;
    voiceButton.classList.add("is-recording");
    voiceButton.textContent = "Stop";
    voiceButton.setAttribute("aria-label", "Stop voice recording");
    voiceButton.setAttribute("aria-pressed", "true");
    setFeedback(voiceStatus, "Recording... select Stop when you are finished.");

    recordingTimeout = window.setTimeout(() => {
      if (mediaRecorder === recorder && recorder.state === "recording") {
        voiceButton.disabled = true;
        setFeedback(voiceStatus, "Maximum recording time reached. Transcribing...");
        recorder.stop();
      }
    }, 60_000);
  } catch (error) {
    microphoneStream?.getTracks().forEach((track) => track.stop());
    microphoneStream = null;
    mediaRecorder = null;
    userInput.disabled = false;
    giftForm.querySelector('button[type="submit"]').disabled = false;
    newConversationButton.disabled = false;
    logoutButton.disabled = false;
    voiceButton.disabled = false;
    setFeedback(voiceStatus, getFriendlyErrorMessage(error, "voice"), "error");
  }
}

async function finishVoiceRecording(recorder) {
  let shouldSubmitTranscript = false;

  if (recordingTimeout !== null) {
    window.clearTimeout(recordingTimeout);
    recordingTimeout = null;
  }

  const chunks = recordedAudioChunks;
  recordedAudioChunks = [];
  microphoneStream?.getTracks().forEach((track) => track.stop());
  microphoneStream = null;
  mediaRecorder = null;

  try {
    const recording = new Blob(chunks, {
      type: recorder.mimeType || "audio/webm",
    });
    if (recording.size === 0) {
      throw new FriendlyError("We didn't catch any audio. Please try again.");
    }

    setFeedback(voiceStatus, "Transcribing your recording...");
    const data = await voiceApi.transcribe(recording);
    const transcript = data?.text?.trim();
    if (!transcript) {
      throw new FriendlyError("We couldn't make out what you said. Please try again.");
    }

    userInput.value = userInput.value.trim()
      ? `${userInput.value.trim()}\n${transcript}`
      : transcript;
    autoResizeTextarea(userInput);
    voiceReplyPending = true;
    setFeedback(voiceStatus, "Sending your voice message...");
    shouldSubmitTranscript = true;
  } catch (error) {
    setFeedback(voiceStatus, getFriendlyErrorMessage(error, "voice"), "error");
  } finally {
    userInput.disabled = false;
    giftForm.querySelector('button[type="submit"]').disabled = false;
    newConversationButton.disabled = false;
    logoutButton.disabled = false;
    voiceButton.disabled = false;
    voiceButton.classList.remove("is-recording");
    voiceButton.textContent = "Voice";
    voiceButton.setAttribute("aria-label", "Start voice recording");
    voiceButton.setAttribute("aria-pressed", "false");
    if (shouldSubmitTranscript) giftForm.requestSubmit();
  }
}

function clearActiveVoiceAudio() {
  stopActiveVoice?.();
  activeVoiceAudio = null;
  stopActiveVoice = null;

  if (activeVoiceObjectUrl) {
    URL.revokeObjectURL(activeVoiceObjectUrl);
    activeVoiceObjectUrl = null;
  }

  messageList.querySelectorAll(".voice-reply-button").forEach((button) => {
    button.remove();
  });
}

function createAudioBlob(base64Audio) {
  const binary = atob(base64Audio);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: "audio/wav" });
}

function attachVoiceReply(audioChunks) {
  if (
    !Array.isArray(audioChunks) ||
    audioChunks.length === 0 ||
    !audioChunks.every((chunk) => typeof chunk === "string" && chunk.length > 0)
  ) {
    throw new Error("The server returned invalid audio data.");
  }

  clearActiveVoiceAudio();
  const row = messageList.lastElementChild;
  if (!row) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "voice-reply-button";
  button.textContent = "Pause voice reply";
  button.setAttribute("aria-label", "Pause spoken reply");
  row.append(button);

  const audio = new Audio();
  let chunkIndex = 0;
  let playbackState = "playing";
  activeVoiceAudio = audio;
  stopActiveVoice = () => {
    playbackState = "stopped";
    audio.pause();
  };

  const playNextChunk = async () => {
    if (playbackState !== "playing") return;
    if (chunkIndex >= audioChunks.length) {
      playbackState = "finished";
      button.textContent = "Replay voice reply";
      button.setAttribute("aria-label", "Replay spoken reply");
      return;
    }

    try {
      if (activeVoiceObjectUrl) URL.revokeObjectURL(activeVoiceObjectUrl);
      activeVoiceObjectUrl = URL.createObjectURL(
        createAudioBlob(audioChunks[chunkIndex])
      );
      audio.src = activeVoiceObjectUrl;
      chunkIndex += 1;
      await audio.play();
      setFeedback(voiceStatus, "");
    } catch (error) {
      playbackState = "idle";
      button.textContent = "Play voice reply";
      button.setAttribute("aria-label", "Play spoken reply");
      setFeedback(
        voiceStatus,
        "Your voice reply is ready, but it couldn't start playing. Tap the play button to listen.",
        "error"
      );
    }
  };

  audio.addEventListener("ended", () => {
    if (playbackState === "playing") void playNextChunk();
  });
  audio.addEventListener("error", () => {
    if (playbackState !== "playing") return;
    playbackState = "idle";
    button.textContent = "Play voice reply";
    button.setAttribute("aria-label", "Play spoken reply");
    setFeedback(voiceStatus, "We couldn't play the voice reply. Please try again.", "error");
  });

  button.addEventListener("click", async () => {
    if (playbackState === "playing") {
      audio.pause();
      playbackState = "paused";
      button.textContent = "Resume voice reply";
      button.setAttribute("aria-label", "Resume spoken reply");
      return;
    }

    if (playbackState === "paused") {
      playbackState = "playing";
      button.textContent = "Pause voice reply";
      button.setAttribute("aria-label", "Pause spoken reply");
      try {
        await audio.play();
        setFeedback(voiceStatus, "");
      } catch (error) {
        playbackState = "paused";
        button.textContent = "Resume voice reply";
        button.setAttribute("aria-label", "Resume spoken reply");
        setFeedback(voiceStatus, "We couldn't resume the voice reply. Please try again.", "error");
      }
      return;
    }

    playbackState = "playing";
    chunkIndex = 0;
    button.textContent = "Pause voice reply";
    button.setAttribute("aria-label", "Pause spoken reply");
    await playNextChunk();
  });

  void playNextChunk();
}

async function handleGiftRequest(event) {
  event.preventDefault();
  const content = userInput.value.trim();
  const isGuestRequest = isGuestMode;
  if (!content || (!currentUser && !isGuestRequest)) return;

  // Clear immediately
  userInput.value = "";
  autoResizeTextarea(userInput);


  const shouldSpeakReply = voiceReplyPending;
  setFeedback(chatFeedback, "");
  setFeedback(voiceStatus, shouldSpeakReply ? "Sending voice message..." : "");
  setLoading(true);
  voiceButton.disabled = true;
  let pendingUserRow;
  let thinkingIndicator;

  try {
    clearActiveVoiceAudio();
    pendingUserRow = appendMessage({ role: "user", content });
    thinkingIndicator = appendThinkingIndicator();
    mainContent.classList.add("has-messages");

    if (!isGuestRequest && activeConversationId === null) {
      const created = await conversationsApi.create();
      const conversation = created?.conversation;
      if (!conversation || conversation.id === undefined || conversation.id === null) {
        throw new Error("The server did not return a valid conversation.");
      }

      activeConversationId = conversation.id;
      rememberActiveConversation(conversation.id);
      upsertConversation(conversation);
      chatHeading.textContent = conversation.title || "New conversation";
    }

    const data = isGuestRequest
      ? await guestApi.sendMessage(content, getGuestHistory())
      : await conversationsApi.sendMessage(activeConversationId, content);
    if (
      typeof data?.userMessage?.content !== "string" ||
      typeof data?.assistantMessage?.content !== "string"
    ) {
      throw new Error("The server returned an invalid message response.");
    }

    if (isGuestRequest) {
      guestMessages.push(
        { role: "user", content: data.userMessage.content },
        { role: "assistant", content: data.assistantMessage.content }
      );
    }

    thinkingIndicator.remove();
    appendMessage({ role: "assistant", content: data.assistantMessage.content });
    // userInput.value = "";
    // autoResizeTextarea(userInput);

    if (!isGuestRequest) {
      try {
        await loadConversations();
      } catch (error) {
        setFeedback(
          chatFeedback,
          "Your reply arrived, but we couldn't refresh your conversation history. Please reload the page.",
          "error"
        );
      }
    }

    if (shouldSpeakReply) {
      voiceReplyPending = false;
      setFeedback(voiceStatus, "Preparing spoken reply...");
      try {
        const speechData = await voiceApi.speech(data.assistantMessage.content);
        attachVoiceReply(speechData?.audioChunks);
      } catch (error) {
        setFeedback(
          voiceStatus,
          "Your reply arrived, but we couldn't prepare the voice version.",
          "error"
        );
      }
    }
  } catch (error) {
    thinkingIndicator?.remove();
    pendingUserRow?.remove();
    mainContent.classList.toggle("has-messages", messageList.childElementCount > 0);
    setFeedback(chatFeedback, getFriendlyErrorMessage(error, "chat"), "error");
  } finally {
    setLoading(false);
    voiceButton.disabled = false;
    userInput.focus();
  }
}

function renderMessages(messages) {
  if (
    !messages.every(
      (message) =>
        message &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string"
    )
  ) {
    throw new Error("The server returned an invalid message history.");
  }

  clearActiveVoiceAudio();
  messageList.replaceChildren(); 
  messages.forEach(appendMessage);
  mainContent.classList.toggle("has-messages", messages.length > 0);
  scrollToLatestMessage();
}

function appendMessage(message) {
  const row = document.createElement("article");
  row.className = `message-row ${message.role}`;

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  if (message.role === "assistant") {
    const label = document.createElement("p");
    label.className = "assistant-label";
    label.textContent = "✦ Gift Genie";
    bubble.append(label);

    const content = document.createElement("div");
    content.className = "assistant-content";
    content.innerHTML = DOMPurify.sanitize(marked.parse(message.content));
    bubble.append(content);
  } else {
    bubble.textContent = message.content;
  }

  row.append(bubble);
  messageList.append(row);
  scrollToLatestMessage();
  return row;
}

function appendThinkingIndicator() {
  const row = document.createElement("article");
  row.className = "message-row assistant thinking-row";
  row.setAttribute("role", "status");
  row.setAttribute("aria-label", "Gift Genie is thinking");

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  const label = document.createElement("p");
  label.className = "assistant-label";
  label.textContent = "✦ Gift Genie is thinking";

  const dots = document.createElement("span");
  dots.className = "thinking-dots";
  dots.setAttribute("aria-hidden", "true");
  for (let index = 0; index < 3; index += 1) {
    dots.append(document.createElement("span"));
  }

  bubble.append(label, dots);
  row.append(bubble);
  messageList.append(row);
  scrollToLatestMessage();
  return row;
}

function scrollToLatestMessage() {
  messageList.lastElementChild?.scrollIntoView({
    behavior: "smooth",
    block: "end",
  });
}

function setHistorySidebarOpen(isOpen, restoreFocus = true) {
  if (isOpen && !mobileLayout.matches) return;

  historySidebar.classList.toggle("is-open", isOpen);
  sidebarBackdrop.classList.toggle("is-visible", isOpen);
  document.body.classList.toggle("sidebar-open", isOpen);
  historyToggle.setAttribute("aria-expanded", String(isOpen));
  historyToggle.setAttribute(
    "aria-label",
    isOpen ? "Close conversation history" : "Open conversation history"
  );

  if (isOpen) {
    historyClose.focus();
  } else if (restoreFocus && mobileLayout.matches) {
    historyToggle.focus();
  }
}

function setFeedback(element, message, type = "") {
  element.textContent = message;
  element.classList.toggle("is-error", type === "error");
}

function setFormBusy(button, isBusy, label) {
  button.disabled = isBusy;
  if (isBusy) button.dataset.idleLabel = button.textContent;
  button.textContent = isBusy ? label : button.dataset.idleLabel || label;
}

start();