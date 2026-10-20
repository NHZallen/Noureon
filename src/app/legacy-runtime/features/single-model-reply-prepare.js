// The first stage of a reply of one model (single-model-response-lifecycle.js): what kind of reply it is. Advanced mode or not, who searches
// (the model by itself, the provider, or a packet in front of the request), the CLI tools and skills it gets, and whether the server makes it
// (planServerReply) and so prepares the files and addresses of the message. Nothing is drawn or sent here.

import { extractLinkedUrls } from './linked-pages.js';
import { resolveReplyMode } from '../../runtime/sandbox/file-mode.js';
import { opencodeModelReadsOfficeViaPdf } from '../../runtime/legacy-core/opencode-models.js';
import { browserSupportsSandbox } from '../../runtime/sandbox/sandbox-protocol.js';
import { cliIdsForReply } from '../../runtime/cli/cli-state.js';
import { getAvailableSkills, lookupSkill, readSkillFile, resolveInvokedSkills } from '../../runtime/skill/skill-bridge.js';
import { invokedSkillsInstruction, skillNamesOfParts } from '../../../data/skill-prompt.js';
import { decisionsFor, verdictOf } from '../../runtime/decisions/decision-store.js';
import { mayNeedFileGuidance } from '../../ui/files/file-intent.js';

export const textOfParts = (parts = []) => parts.map((part) => part?.text || '').join('\n');

// A switch to Standard mode is worth saying only when the request looks like a task Advanced mode is for: files, data or attachments.
// The Decisions model's judgement of the message decides when there is one (decision-client.js), the word lists otherwise.
export const looksLikeFileTask = (parts = []) => parts.some((part) => part?.inlineData)
  || (verdictOf(decisionsFor(textOfParts(parts)), 'file') ?? mayNeedFileGuidance(textOfParts(parts)));

// Files in the conversation (attached by the person, or made by Python): a follow-up may well be about them.
const conversationHasFiles = (conversation) => (conversation?.messages || []).some((message) => (
  (message?.parts || []).some((part) => part?.inlineData || part?.sandboxFile)
));

/**
 * What kind of reply this is. `deps`: { getConfig, supportsToolCalling, webResearch, serverReply, getWindow }; `request`: the arguments of
 * the reply (userParts, modelInfo, conversation, webSearchEnabled, resumeRun, synthesis, assistantMessageId).
 */
export async function prepareReply({ getConfig, supportsToolCalling, webResearch, serverReply, getWindow }, {
  userParts, modelInfo, conversation, webSearchEnabled, resumeRun, synthesis, assistantMessageId
}) {
  const replyMode = supportsToolCalling ? resolveReplyMode({
    conversation,
    config: getConfig(),
    modelInfo,
    supportsToolCalling,
    browserSupported: browserSupportsSandbox(getWindow())
  }) : { advanced: false, reason: null };
  // A model that calls tools searches the web by itself, in a Standard reply and next to Python in Advanced mode (the search
  // packet is for the others).
  const researchByModel = Boolean(webSearchEnabled && webResearch?.canUse(modelInfo));
  // A web address in the message is read for the models that cannot open one (provider-request-support.js decides which). Not when the person
  // chose a CLI tool with "@" and the model searches and opens pages by itself: the address is the tool's, and the model reads it if it needs to.
  const addressIsForTool = Boolean(synthesis) || (researchByModel && Boolean(supportsToolCalling?.(modelInfo)) && cliIdsForReply(getConfig(), userParts).chosen.length > 0);
  const canCallTools = Boolean(supportsToolCalling?.(modelInfo));
  // The tools the model may use by itself are only given when the message is judged to need one; the ones chosen with "@" always are.
  const ownToolsAllowed = verdictOf(decisionsFor(textOfParts(userParts)), 'tool') !== false;
  const cli = canCallTools ? cliIdsForReply(getConfig(), userParts, { ownAllowed: ownToolsAllowed }) : { chosen: [], ids: [] };
  // The skills asked for with "/" in this message are given to the model in full, with this reply only (whatever the kind of reply: they go in the
  // system instructions, which the server is sent as they are).
  // A search the provider makes itself (some refuse our tools next to it) or a search packet put in front of the request: no skill tool then.
  const ownSearchReply = Boolean(webSearchEnabled && !researchByModel);
  // The files of a skill asked for are told about only when the model has a tool to read them.
  const invokedSkills = await resolveInvokedSkills(skillNamesOfParts(userParts));
  const filesNote = canCallTools && !ownSearchReply && invokedSkills.some((skill) => skill.files?.length) ? (await import('../../../data/skill-files-note.js')).skillFilesNote : null;
  const skillInstruction = invokedSkillsInstruction(invokedSkills, { filesNote });
  const skillOptions = skillInstruction ? { additionalSystemInstruction: skillInstruction } : {};
  // The skills the model may load by itself (the ones it is told about, and not those it was just given whole): only for a model that calls tools.
  const availableSkills = canCallTools ? await getAvailableSkills(skillNamesOfParts(userParts)) : [];
  const { createSkillLoader } = availableSkills.length && !ownSearchReply ? await import('../../../data/skill-tool.js') : {};
  const makeSkillLoader = (lookup = lookupSkill) => (createSkillLoader ? createSkillLoader({ available: availableSkills, lookup, readFile: readSkillFile }) : null);
  // Advanced mode is the default, so most replies are "advanced" by the setting alone. Python is only needed when the request is
  // about files or data, or the conversation already has some; any other reply is the same without it, and the server makes it.
  // The CLI tools chosen with "@" (and those the person lets the model use by itself) run in the same sandbox, so they need it whatever the
  // setting says; a model that cannot call tools cannot use them.
  const needsPython = cli.ids.length > 0 || (replyMode.advanced && (looksLikeFileTask(userParts) || conversationHasFiles(conversation)));
  // (The synthesis of a council held here is made here too.)
  // The files and the addresses of the message are prepared (read, written down by the translator model, fetched) by the server when it makes the reply,
  // so the reply goes on when the page is closed; when it does not take the reply, they are prepared here (docs/superpowers/specs/2026-10-20-server-document-prep-design.md).
  const readsAddresses = !addressIsForTool && verdictOf(decisionsFor(textOfParts(userParts)), 'url') !== false;
  const hasAddresses = readsAddresses && extractLinkedUrls(textOfParts(userParts)).urls.length > 0;
  const hasAttachments = userParts.some((part) => part.inlineData);
  // Whether the server makes this reply, and so (for a model that cannot search) the search too.
  const plan = !resumeRun && !synthesis && serverReply && assistantMessageId
    ? serverReply.plan({ conversation, advanced: needsPython, webSearchEnabled, researchByModel, provider: modelInfo?.provider, documentsToPrepare: hasAttachments || hasAddresses,
      // A Word or PowerPoint file for a model that reads it better as a PDF: only the server makes the PDF, so it prepares the files then.
      officeViaPdf: userParts.some((part) => part?.inlineData && opencodeModelReadsOfficeViaPdf(modelInfo, part.inlineData.mimeType)) })
    : null;
  const serverSearches = Boolean(plan?.ok && plan.webSearch === 'packet');
  const serverPrepares = Boolean(plan?.ok && plan.documents);
  // The files, the search packet and the addresses are prepared on this page first (before the server is asked), unless the server does it.
  const hasTranslationInputs = !resumeRun && !serverPrepares && (hasAttachments ||
    Boolean(webSearchEnabled && !researchByModel && !serverSearches) ||
    hasAddresses);
  return {
    replyMode,
    researchByModel,
    addressIsForTool,
    canCallTools,
    cli,
    ownSearchReply,
    invokedSkills,
    skillOptions,
    availableSkills,
    makeSkillLoader,
    readsAddresses,
    hasAddresses,
    plan,
    serverSearches,
    serverPrepares,
    hasTranslationInputs
  };
}
