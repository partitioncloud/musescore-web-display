/** An HTTP error answer, to tell it apart from a file that can't be parsed */
export class FetchError extends Error {
    constructor(url, response) {
        super(`Could not load ${url} (${response.status} ${response.statusText}).`);
        this.name = "FetchError";
    }
}

/** fetch(), but rejects with a FetchError if the answer is an HTTP error */
export async function fetchOk(url) {
    const response = await fetch(url);
    if (!response.ok) throw new FetchError(url, response);

    return response;
}
