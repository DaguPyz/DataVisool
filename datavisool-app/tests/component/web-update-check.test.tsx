/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import WebUpdateNotice from '@/plugins/workbench/WebUpdateNotice.tsx';
import {useWorkbenchRequests} from '@/plugins/workbench/useWorkbenchRequests.ts';

const requests = vi.hoisted(() => ({get: vi.fn(), post: vi.fn()}));

vi.mock('@/util/FetchUtil.ts', () => ({default: requests}));
vi.mock('@/comps/common-component/contact-author/ContactAuthorModal.tsx', () => ({default: () => null}));
vi.mock('@datavisool/ui', () => ({
    Button: ({children, onClick, loading}: any) => <button type="button" onClick={onClick} disabled={loading}>{children}</button>,
    Dialog: ({open, children}: any) => open ? <div role="dialog">{children}</div> : null,
}));

const ready = () => true;
const ignoreExpiry = () => {};
const upgrade = {needUpgrade: true, latestVersion: '2026.10.0'};
let controller: AbortController;

function Notice({token}: {token?: string}) {
    const beginRequest = useWorkbenchRequests(controller.signal, ready);
    return <WebUpdateNotice token={token} beginRequest={beginRequest} onSessionExpiry={ignoreExpiry}/>;
}

describe('Workbench version notice', () => {
    beforeEach(() => {
        controller = new AbortController();
        requests.get.mockReset();
        requests.post.mockReset();
    });
    afterEach(cleanup);

    test('checks once with the admin token and skips the offered version', async () => {
        requests.get.mockResolvedValue(upgrade);
        requests.post.mockResolvedValue(true);
        render(<Notice token="fixture-token"/>);

        expect(await screen.findByText('发现新版本')).toBeInTheDocument();
        expect(requests.get).toHaveBeenCalledTimes(1);
        expect(requests.get).toHaveBeenCalledWith(
            expect.stringMatching(/^\/api\/webUpdate\/check\?currentVersion=[^&]+$/),
            expect.objectContaining({headers: {Authorization: 'Bearer fixture-token'}}),
        );

        fireEvent.click(screen.getByRole('button', {name: '跳过该版本'}));
        await waitFor(() => expect(screen.queryByText('发现新版本')).not.toBeInTheDocument());
        expect(requests.post).toHaveBeenCalledWith('/api/webUpdate/skip', {latestVersion: upgrade.latestVersion},
            expect.objectContaining({headers: {Authorization: 'Bearer fixture-token'}}));
    });

    test('never checks without a token from an eligible session', () => {
        render(<Notice/>);
        expect(requests.get).not.toHaveBeenCalled();
    });

    test('keeps the notice visible when skipping the version fails', async () => {
        requests.get.mockResolvedValue(upgrade);
        requests.post.mockResolvedValue(false);
        render(<Notice token="fixture-token"/>);
        const skip = await screen.findByRole('button', {name: '跳过该版本'});
        fireEvent.click(skip);
        await waitFor(() => expect(skip).toBeEnabled());
        expect(screen.getByText('发现新版本')).toBeInTheDocument();
    });

    test('a pending check is aborted on unmount', async () => {
        let resolveCheck!: (result: unknown) => void;
        requests.get.mockImplementation(() => new Promise(resolve => { resolveCheck = resolve; }));
        const view = render(<Notice token="fixture-token"/>);
        await waitFor(() => expect(requests.get).toHaveBeenCalledTimes(1));
        const request = requests.get.mock.calls[0][1] as {signal: AbortSignal};
        view.unmount();
        expect(request.signal.aborted).toBe(true);
        resolveCheck(upgrade);
    });
});
