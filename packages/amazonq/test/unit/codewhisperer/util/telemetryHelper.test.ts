/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { assertTelemetryCurried, resetCodeWhispererGlobalVariables } from 'aws-core-vscode/test'
import { TelemetryHelper, Completion, session } from 'aws-core-vscode/codewhisperer'
import {
    CodewhispererCompletionType,
    CodewhispererSuggestionState,
    CodewhispererUserDecision,
} from 'aws-core-vscode/shared'
import sinon from 'sinon'

// TODO: improve and move the following test utils to codewhisperer/testUtils.ts
function aUserDecision(
    completionType: CodewhispererCompletionType,
    codewhispererSuggestionIndex: number,
    codewhispererSuggestionState: CodewhispererSuggestionState
): CodewhispererUserDecision {
    return {
        codewhispererCompletionType: completionType,
        codewhispererLanguage: 'python',
        codewhispererRequestId: 'aFakeRequestId',
        codewhispererSessionId: 'aFakeSessionId',
        codewhispererSuggestionIndex: codewhispererSuggestionIndex,
        codewhispererSuggestionReferenceCount: 0,
        codewhispererSuggestionState: codewhispererSuggestionState,
        codewhispererTriggerType: 'OnDemand',
        credentialStartUrl: 'https://www.amazon.com',
    }
}

function aCompletion(): Completion {
    return {
        content: 'aFakeContent',
    }
}

describe('telemetryHelper', function () {
    describe('clientComponentLatency', function () {
        let sut: TelemetryHelper

        beforeEach(function () {
            sut = new TelemetryHelper()
        })

        afterEach(function () {
            sinon.restore()
        })

        it('resetClientComponentLatencyTime should reset state variables', function () {
            session.invokeSuggestionStartTime = 100
            session.preprocessEndTime = 200
            session.sdkApiCallStartTime = 300
            session.fetchCredentialStartTime = 400
            session.firstSuggestionShowTime = 500

            sut.setSdkApiCallEndTime()
            sut.setAllPaginationEndTime()
            sut.setFirstResponseRequestId('aFakeRequestId')

            sut.resetClientComponentLatencyTime()

            assert.strictEqual(session.invokeSuggestionStartTime, 0)
            assert.strictEqual(session.preprocessEndTime, 0)
            assert.strictEqual(session.sdkApiCallStartTime, 0)
            assert.strictEqual(session.fetchCredentialStartTime, 0)
            assert.strictEqual(session.firstSuggestionShowTime, 0)
            assert.strictEqual(sut.sdkApiCallEndTime, 0)
            assert.strictEqual(sut.allPaginationEndTime, 0)
            assert.strictEqual(sut.firstResponseRequestId, '')
        })

        it('setInvocationSuggestionStartTime should call resetClientComponentLatencyTime', function () {
            const resetStub = sinon.stub(sut, 'resetClientComponentLatencyTime')
            sut.setInvokeSuggestionStartTime()
            assert.ok(resetStub.calledOnce)
        })
    })

    describe('aggregateUserDecisionByRequest', function () {
        let sut: TelemetryHelper

        beforeEach(function () {
            sut = new TelemetryHelper()
        })

        it('should return Line and Accept', function () {
            const decisions: CodewhispererUserDecision[] = [
                aUserDecision('Line', 0, 'Accept'),
                aUserDecision('Line', 1, 'Discard'),
                aUserDecision('Block', 2, 'Ignore'),
                aUserDecision('Block', 3, 'Ignore'),
            ]

            const actual = sut.aggregateUserDecisionByRequest(decisions, 'aFakeRequestId', 'aFakeSessionId')
            assert.ok(actual)
            assert.strictEqual(actual?.codewhispererCompletionType, 'Line')
            assert.strictEqual(actual?.codewhispererSuggestionState, 'Accept')
        })

        it('should return Line and Reject', function () {
            const decisions: CodewhispererUserDecision[] = [
                aUserDecision('Line', 0, 'Discard'),
                aUserDecision('Line', 1, 'Reject'),
                aUserDecision('Line', 2, 'Unseen'),
                aUserDecision('Line', 3, 'Unseen'),
            ]

            const actual = sut.aggregateUserDecisionByRequest(decisions, 'aFakeRequestId', 'aFakeSessionId')
            assert.ok(actual)
            assert.strictEqual(actual?.codewhispererCompletionType, 'Line')
            assert.strictEqual(actual?.codewhispererSuggestionState, 'Reject')
        })

        it('should return Block and Accept', function () {
            const decisions: CodewhispererUserDecision[] = [
                aUserDecision('Block', 0, 'Discard'),
                aUserDecision('Block', 1, 'Accept'),
                aUserDecision('Block', 2, 'Discard'),
                aUserDecision('Block', 3, 'Ignore'),
            ]

            const actual = sut.aggregateUserDecisionByRequest(decisions, 'aFakeRequestId', 'aFakeSessionId')
            assert.ok(actual)
            assert.strictEqual(actual?.codewhispererCompletionType, 'Block')
            assert.strictEqual(actual?.codewhispererSuggestionState, 'Accept')
        })
    })

    describe('sendUserTriggerDecisionTelemetry', function () {
        let sut: TelemetryHelper

        beforeEach(async function () {
            await resetCodeWhispererGlobalVariables()
            sut = new TelemetryHelper()
        })

        it('should return Line and Accept', function () {
            sut.recordUserDecisionTelemetry(
                ['aFakeRequestId', 'aFakeRequestId', 'aFakeRequestId2'],
                'aFakeSessionId',
                [aCompletion(), aCompletion(), aCompletion(), aCompletion()],
                0,
                0,
                new Map([
                    [0, 'Line'],
                    [1, 'Line'],
                    [2, 'Block'],
                    [3, 'Block'],
                ])
            )

            sut.sendUserTriggerDecisionTelemetry('aFakeSessionId', aCompletion().content, 0)
            const assertTelemetry = assertTelemetryCurried('codewhisperer_userTriggerDecision')
            assertTelemetry({
                codewhispererSessionId: 'aFakeSessionId',
                codewhispererFirstRequestId: 'aFakeRequestId',
                codewhispererLanguage: 'python',
                codewhispererTriggerType: 'OnDemand',
                codewhispererLineNumber: 0,
                codewhispererCursorOffset: 0,
                codewhispererSuggestionCount: 4,
                codewhispererSuggestionImportCount: 0,
                codewhispererSuggestionState: 'Accept',
                codewhispererCompletionType: 'Line',
                codewhispererTypeaheadLength: 0,
                codewhispererCharactersAccepted: aCompletion().content.length,
            })
        })

        it('should return Line and Accept 2', function () {
            sut.recordUserDecisionTelemetry(
                ['aFakeRequestId', 'aFakeRequestId', 'aFakeRequestId2'],
                'aFakeSessionId',
                [aCompletion(), aCompletion(), aCompletion(), aCompletion()],
                3,
                0,
                new Map([
                    [0, 'Line'],
                    [1, 'Line'],
                    [2, 'Line'],
                    [3, 'Line'],
                ])
            )

            sut.sendUserTriggerDecisionTelemetry('aFakeSessionId', aCompletion().content, 0)
            const assertTelemetry = assertTelemetryCurried('codewhisperer_userTriggerDecision')
            assertTelemetry({
                codewhispererSessionId: 'aFakeSessionId',
                codewhispererFirstRequestId: 'aFakeRequestId',
                codewhispererLanguage: 'python',
                codewhispererTriggerType: 'OnDemand',
                codewhispererLineNumber: 0,
                codewhispererCursorOffset: 0,
                codewhispererSuggestionCount: 4,
                codewhispererSuggestionImportCount: 0,
                codewhispererSuggestionState: 'Accept',
                codewhispererCompletionType: 'Line',
                codewhispererTypeaheadLength: 0,
                codewhispererCharactersAccepted: aCompletion().content.length,
            })
        })

        it('should return Line and Reject', function () {
            sut.recordUserDecisionTelemetry(
                ['aFakeRequestId', 'aFakeRequestId', 'aFakeRequestId2'],
                'aFakeSessionId',
                [aCompletion(), aCompletion(), aCompletion(), aCompletion()],
                -1,
                0,
                new Map([
                    [0, 'Line'],
                    [1, 'Line'],
                    [2, 'Line'],
                    [3, 'Line'],
                ])
            )

            sut.sendUserTriggerDecisionTelemetry('aFakeSessionId', '', 0)
            const assertTelemetry = assertTelemetryCurried('codewhisperer_userTriggerDecision')
            assertTelemetry({
                codewhispererSessionId: 'aFakeSessionId',
                codewhispererFirstRequestId: 'aFakeRequestId',
                codewhispererLanguage: 'python',
                codewhispererTriggerType: 'OnDemand',
                codewhispererLineNumber: 0,
                codewhispererCursorOffset: 0,
                codewhispererSuggestionCount: 4,
                codewhispererSuggestionImportCount: 0,
                codewhispererSuggestionState: 'Reject',
                codewhispererCompletionType: 'Line',
                codewhispererTypeaheadLength: 0,
                codewhispererCharactersAccepted: 0,
            })
        })
    })

    describe('getSuggestionState', function () {
        let telemetryHelper = new TelemetryHelper()
        beforeEach(async function () {
            await resetCodeWhispererGlobalVariables()
            telemetryHelper = new TelemetryHelper()
        })

        it('user event is discard when recommendation state is Discarded with accept index = -1', function () {
            const actual = telemetryHelper.getSuggestionState(0, -1, new Map([[0, 'Discard']]))
            assert.strictEqual(actual, 'Discard')
        })

        it('user event is reject when recommendation state is Showed with accept index = -1', function () {
            const actual = telemetryHelper.getSuggestionState(0, -1, new Map([[0, 'Showed']]))
            assert.strictEqual(actual, 'Reject')
        })

        it('user event is Accept when recommendation state is Showed with accept index matches', function () {
            const actual = telemetryHelper.getSuggestionState(0, 0, new Map([[0, 'Showed']]))
            assert.strictEqual(actual, 'Accept')
        })

        it('user event is Ignore when recommendation state is Showed with accept index does not match', function () {
            const actual = telemetryHelper.getSuggestionState(0, 1, new Map([[0, 'Showed']]))
            assert.strictEqual(actual, 'Ignore')
        })

        it('user event is Unseen when recommendation state is not Showed, is not Unseen when recommendation is showed', function () {
            const actual0 = telemetryHelper.getSuggestionState(0, 1, new Map([[1, 'Showed']]))
            assert.strictEqual(actual0, 'Unseen')
            const actual1 = telemetryHelper.getSuggestionState(1, 1, new Map([[1, 'Showed']]))
            assert.strictEqual(actual1, 'Accept')
        })

        it('user event is Filter when recommendation state is Filter', function () {
            const actual = telemetryHelper.getSuggestionState(0, 1, new Map([[0, 'Filter']]))
            assert.strictEqual(actual, 'Filter')
        })

        it('user event is Empty when recommendation state is Empty', function () {
            const actual = telemetryHelper.getSuggestionState(0, 1, new Map([[0, 'Empty']]))
            assert.strictEqual(actual, 'Empty')
        })
    })
})
