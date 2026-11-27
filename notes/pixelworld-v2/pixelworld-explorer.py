import marimo

__generated_with = "0.23.11"
app = marimo.App(width="medium")


@app.cell
def _():
    import marimo as mo

    return


@app.cell
def _():
    import numpy as np
    import pandas as pd

    return np, pd


@app.cell
def _(np):
    def calc_pq_odd(L, W):
        """Calculated close values for p and q half-diagonals from a diamond tile"""
        # Get a lower bound of the
        q = np.floor(np.sqrt(2)*W)
        # Make sure it's even (does q need to be even? Not sure)
        if q%2 != 1:
            q += 1
        p = 2*q+2
        return p/2, q/2

    return (calc_pq_odd,)


@app.cell
def _(np):
    def calc_pq_even(L, W):
        """Calculated close values for p and q half-diagonals from a diamond tile"""
        # Get a lower bound of the
        q = np.floor(np.sqrt(2)*W)
        # Make sure it's even (does q need to be even? Not sure)
        if q%2 != 0:
            q += 1
        p = 2*q-2
        return p/2, q/2

    return (calc_pq_even,)


@app.cell
def _(np):
    def calc_params(L, W, p, q):
        """Calculate the tunable parameters for the othrographic camera"""
        theta_0 = np.arcsin(W/L)
        s_x = np.sqrt(2)*p/L
        s_y = np.sqrt(np.cos(theta_0)**2 + 2*q**2/L**2)
        theta_45 = np.arcsin(np.sqrt(2)*q/s_y/L)
        return {
            's_x': s_x,
            's_y': s_y,
            'theta_0': np.degrees(theta_0),
            'theta_45': np.degrees(theta_45),
        }

    return (calc_params,)


@app.cell
def _(np):
    def calc_errors(s_x, s_y, theta_0, theta_45):
        """Calculated relative errors for all parameters and relative error"""
        err_s_x = np.abs(1-s_x)
        err_s_y = np.abs(1-s_y)
        err_theta_0 = np.abs(30-theta_0)/30
        err_theta_45 = np.abs(30-theta_45)/45
        max_err = np.max([err_s_x, err_s_y, err_theta_0, err_theta_45])
        return {
            'err_s_x': err_s_x,
            'err_s_y': err_s_y,
            'err_theta_0': err_theta_0,
            'err_theta_45': err_theta_45,
            'max_err': max_err
        }

    return (calc_errors,)


@app.cell
def _(calc_errors, calc_params, calc_pq_odd):
    def run_search_odd(L, W):
        """Run a parameter search for a L/W pair foreshortened tile"""
        p, q = calc_pq_odd(L, W)
        sizes = {'L': L, 'W': W, 'p': p, 'q': q}
        params = calc_params(**sizes)
        errors = calc_errors(**params)
        data = sizes.copy()
        data.update(params)
        data.update(errors)
        return data

    return (run_search_odd,)


@app.cell
def _(calc_errors, calc_params, calc_pq_even):
    def run_search_even(L, W):
        """Run a parameter search for a L/W pair foreshortened tile"""
        p, q = calc_pq_even(L, W)
        sizes = {'L': L, 'W': W, 'p': p, 'q': q}
        params = calc_params(**sizes)
        errors = calc_errors(**params)
        data = sizes.copy()
        data.update(params)
        data.update(errors)
        return data

    return (run_search_even,)


@app.cell
def _(np, pd, run_search_odd):
    data_odd = []
    for L_odd in range(5, 33):
        W_min_odd = int(np.floor(L_odd/2-1))
        W_max_odd = int(np.ceil(L_odd/2+1))
        for W_odd in range(W_min_odd, W_max_odd+1):
            data_odd.append(run_search_odd(L_odd, W_odd))
    df_odd = pd.DataFrame(data_odd)
    df_odd.sort_values(by='max_err')
    return


@app.cell
def _(np, pd, run_search_even):
    data_even = []
    for L_even in range(5, 33):
        W_min_even = int(np.floor(L_even/2-1))
        W_max_even = int(np.ceil(L_even/2+1))
        for W_even in range(W_min_even, W_max_even+1):
            data_even.append(run_search_even(L_even, W_even))
    df_even = pd.DataFrame(data_even)
    df_even.sort_values(by='max_err')
    return


@app.cell
def _():
    return


if __name__ == "__main__":
    app.run()
