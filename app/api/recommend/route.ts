import { NextRequest, NextResponse } from 'next/server';

const MARKETPLACE_BASE = 'https://marketplace.api.healthcare.gov/api/v1';

export async function POST(req: NextRequest) {
  const apiKey = process.env.MARKETPLACE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing MARKETPLACE_API_KEY' },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { zipCode, householdSize, annualIncome, ages, usesTobacco } = body;

  // Validate required fields
  if (!zipCode || !householdSize || !annualIncome || !Array.isArray(ages) || ages.length === 0) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 }
    );
  }

  try {
    // Step 1: ZIP -> county FIPS code
    const countyRes = await fetch(
      `${MARKETPLACE_BASE}/counties/by/zip/${zipCode}?apikey=${apiKey}`
    );

    if (!countyRes.ok) {
      const text = await countyRes.text();
      return NextResponse.json(
        { error: 'CMS county lookup failed', status: countyRes.status, detail: text },
        { status: 502 }
      );
    }

    const countyData = await countyRes.json();
    const counties = countyData.counties || [];
    if (counties.length === 0) {
      return NextResponse.json(
        { error: 'No county found for that ZIP code' },
        { status: 404 }
      );
    }

    // Use the first county returned (most ZIPs map to one)
    const county = counties[0];
    const countyfips = county.fips;
    const state = county.state;

    // Step 2: Build the plans/search request payload
    const people = ages.map((age: number, i: number) => ({
      age: age,
      aptc_eligible: true,
      gender: 'Female', // CMS requires it; doesn't drastically change pricing
      uses_tobacco: i === 0 ? !!usesTobacco : false,
    }));

    const searchPayload = {
      household: {
        income: annualIncome,
        people: people,
      },
      market: 'Individual',
      place: {
        countyfips: countyfips,
        state: state,
        zipcode: zipCode,
      },
      year: 2026,
    };

    // Step 3: Call CMS plans/search
    const plansRes = await fetch(
      `${MARKETPLACE_BASE}/plans/search?apikey=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchPayload),
      }
    );

    if (!plansRes.ok) {
      const text = await plansRes.text();
      return NextResponse.json(
        {
          error: 'CMS plans search failed',
          status: plansRes.status,
          detail: text,
          payloadSent: searchPayload,
        },
        { status: 502 }
      );
    }

    const plansData = await plansRes.json();
    const plans = plansData.plans || [];

    // Return a simplified version for now (we'll enrich in Step 4 with Claude)
    return NextResponse.json({
      success: true,
      county: { fips: countyfips, state: state, name: county.name },
      planCount: plans.length,
      // Just return top 10 plans for now to keep response size manageable
      plans: plans.slice(0, 10).map((p: any) => ({
        id: p.id,
        name: p.name,
        issuer: p.issuer?.name,
        type: p.type,
        metalLevel: p.metal_level,
        premium: p.premium,
        premiumWithCredit: p.premium_w_credit,
        deductibles: p.deductibles,
        moops: p.moops, // max out of pocket
      })),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Server error', detail: err?.message || String(err) },
      { status: 500 }
    );
  }
}