// Looklook TYPERT Host manifest — register Remote methods with the
// DSH typert-loader so the api-gateway can route RPCs to this plugin.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';

const _any$schema = z.any();

export const TYPERT = {
  package: 'dsh-looklook',
  face: 'host',
  schemas: [],
  model: {
    services: [{
      key: 'looklookRemote',
      exportName: 'LooklookRemoteService',
      description: 'Looklook Remote RPC host service',
      summary: 'Looklook Remote RPC host service',
      tags: [],
      types: [],
      members: [
        { kind: 'method', name: 'describeSettings', signature: 'describeSettings(): Promise<any>', summary: 'Read looklook/vision/audio settings', tags: [] },
        { kind: 'method', name: 'updateSettings', signature: 'updateSettings(payload: any): Promise<any>', summary: 'Update looklook/vision/audio settings', tags: [] },
        { kind: 'method', name: 'describeCredentials', signature: 'describeCredentials(refs: any): Promise<any>', summary: 'List credential refs for providers', tags: [] },
        { kind: 'method', name: 'setCredential', signature: 'setCredential(payload: any): Promise<any>', summary: 'Set a credential value', tags: [] },
        { kind: 'method', name: 'listModels', signature: 'listModels(provider: any): Promise<any>', summary: 'Probe a vision provider for available models', tags: [] },
        { kind: 'method', name: 'upload', signature: 'upload(payload: any): Promise<any>', summary: 'Upload a file into the session uploads dir', tags: [] },
        { kind: 'method', name: 'asrStatus', signature: 'asrStatus(): Promise<any>', summary: 'Check local ASR install status', tags: [] },
        { kind: 'method', name: 'asrInstall', signature: 'asrInstall(payload: any): Promise<any>', summary: 'Start a one-click local ASR install', tags: [] },
        { kind: 'method', name: 'sessionModality', signature: 'sessionModality(sessionId: any): Promise<any>', summary: 'Report whether the session model accepts image input', tags: [] },
        { kind: 'method', name: 'readUpload', signature: 'readUpload(payload: any): Promise<any>', summary: 'Read back an uploaded file', tags: [] },
        { kind: 'method', name: 'envCheck', signature: 'envCheck(): Promise<any>', summary: 'Run environment check', tags: [] },
        { kind: 'method', name: 'envRepair', signature: 'envRepair(action: any): Promise<any>', summary: 'Attempt environment repair', tags: [] },
        { kind: 'method', name: 'testVision', signature: 'testVision(provider: any): Promise<any>', summary: 'Probe a vision model capability', tags: [] },
        { kind: 'method', name: 'testAudio', signature: 'testAudio(provider: any): Promise<any>', summary: 'Probe an audio model capability', tags: [] },
        { kind: 'method', name: 'uninstallLooklook', signature: 'uninstallLooklook(): Promise<any>', summary: 'Uninstall LookLook plugin config', tags: [] },
      ],
    }],
    types: [],
    events: [],
    objects: [],
  },
  invocations: [
    {
      id: 'dsh-looklook#looklook/describeSettings',
      service: 'looklookRemote', namespace: 'looklook', method: 'describeSettings',
      invocation: { kind: 'direct' }, parameters: [],
      result: { mode: 'strict', typeSymbol: 'LooklookSettingsResult', schema: _any$schema },
    },
    {
      id: 'dsh-looklook#looklook/updateSettings',
      service: 'looklookRemote', namespace: 'looklook', method: 'updateSettings',
      invocation: { kind: 'direct' },
      parameters: [{ name: 'payload', wire: 'payload', source: 'json', codec: { mode: 'strict', typeSymbol: 'LooklookSettingsUpdate', schema: _any$schema } }],
      result: { mode: 'strict', typeSymbol: 'LooklookSettingsUpdateResult', schema: _any$schema },
    },
    {
      id: 'dsh-looklook#looklook/describeCredentials',
      service: 'looklookRemote', namespace: 'looklook', method: 'describeCredentials',
      invocation: { kind: 'direct' },
      parameters: [{ name: 'refs', wire: 'refs', source: 'json', codec: { mode: 'strict', typeSymbol: 'LooklookCredentialRefs', schema: _any$schema } }],
      result: { mode: 'strict', typeSymbol: 'LooklookCredentialsResult', schema: _any$schema },
    },
    {
      id: 'dsh-looklook#looklook/setCredential',
      service: 'looklookRemote', namespace: 'looklook', method: 'setCredential',
      invocation: { kind: 'direct' },
      parameters: [{ name: 'payload', wire: 'payload', source: 'json', codec: { mode: 'strict', typeSymbol: 'LooklookCredentialPayload', schema: _any$schema } }],
      result: { mode: 'strict', typeSymbol: 'LooklookCredentialResult', schema: _any$schema },
    },
    {
      id: 'dsh-looklook#looklook/listModels',
      service: 'looklookRemote', namespace: 'looklook', method: 'listModels',
      invocation: { kind: 'direct' },
      parameters: [{ name: 'provider', wire: 'provider', source: 'json', codec: { mode: 'strict', typeSymbol: 'VisionProviderProbe', schema: _any$schema } }],
      result: { mode: 'strict', typeSymbol: 'LooklookListModelsResult', schema: _any$schema },
    },
    {
      id: 'dsh-looklook#looklook/upload',
      service: 'looklookRemote', namespace: 'looklook', method: 'upload',
      invocation: { kind: 'direct' },
      parameters: [{ name: 'payload', wire: 'payload', source: 'json', codec: { mode: 'strict', typeSymbol: 'LooklookUploadPayload', schema: _any$schema } }],
      result: { mode: 'strict', typeSymbol: 'LooklookUploadResult', schema: _any$schema },
    },
    {
      id: 'dsh-looklook#looklook/asrStatus',
      service: 'looklookRemote', namespace: 'looklook', method: 'asrStatus',
      invocation: { kind: 'direct' }, parameters: [],
      result: { mode: 'strict', typeSymbol: 'LooklookAsrStatus', schema: _any$schema },
    },
    {
      id: 'dsh-looklook#looklook/asrInstall',
      service: 'looklookRemote', namespace: 'looklook', method: 'asrInstall',
      invocation: { kind: 'direct' }, parameters: [],
      result: { mode: 'strict', typeSymbol: 'LooklookAsrInstallResult', schema: _any$schema },
    },
    {
      id: 'dsh-looklook#looklook/sessionModality',
      service: 'looklookRemote', namespace: 'looklook', method: 'sessionModality',
      invocation: { kind: 'direct' },
      parameters: [{ name: 'sessionId', wire: 'sessionId', source: 'json', codec: { mode: 'strict', typeSymbol: 'SessionId', schema: _any$schema } }],
      result: { mode: 'strict', typeSymbol: 'LooklookModalityResult', schema: _any$schema },
    },
    {
      id: 'dsh-looklook#looklook/readUpload',
      service: 'looklookRemote', namespace: 'looklook', method: 'readUpload',
      invocation: { kind: 'direct' },
      parameters: [{ name: 'payload', wire: 'payload', source: 'json', codec: { mode: 'strict', typeSymbol: 'LooklookReadUploadPayload', schema: _any$schema } }],
      result: { mode: 'strict', typeSymbol: 'LooklookReadUploadResult', schema: _any$schema },
    },
    {
      id: 'dsh-looklook#looklook/envCheck',
      service: 'looklookRemote', namespace: 'looklook', method: 'envCheck',
      invocation: { kind: 'direct' }, parameters: [],
      result: { mode: 'strict', typeSymbol: 'LooklookEnvCheckReport', schema: _any$schema },
    },
    {
      id: 'dsh-looklook#looklook/envRepair',
      service: 'looklookRemote', namespace: 'looklook', method: 'envRepair',
      invocation: { kind: 'direct' },
      parameters: [{ name: 'action', wire: 'action', source: 'json', codec: { mode: 'strict', typeSymbol: 'EnvRepairAction', schema: _any$schema } }],
      result: { mode: 'strict', typeSymbol: 'LooklookEnvCheckItem', schema: _any$schema },
    },
    {
      id: 'dsh-looklook#looklook/testVision',
      service: 'looklookRemote', namespace: 'looklook', method: 'testVision',
      invocation: { kind: 'direct' },
      parameters: [{ name: 'provider', wire: 'provider', source: 'json', codec: { mode: 'strict', typeSymbol: 'TestProviderProbe', schema: _any$schema } }],
      result: { mode: 'strict', typeSymbol: 'LooklookTestVisionResult', schema: _any$schema },
    },
    {
      id: 'dsh-looklook#looklook/testAudio',
      service: 'looklookRemote', namespace: 'looklook', method: 'testAudio',
      invocation: { kind: 'direct' },
      parameters: [{ name: 'provider', wire: 'provider', source: 'json', codec: { mode: 'strict', typeSymbol: 'TestProviderProbe', schema: _any$schema } }],
      result: { mode: 'strict', typeSymbol: 'LooklookTestAudioResult', schema: _any$schema },
    },
  ],
};
