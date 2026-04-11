import { NextRequest } from "next/server";

interface TestPayload {
  brokerId: string;
  credentials: Record<string, string>;
}

interface BrokerTestResult {
  success: boolean;
  message: string;
  brokerName: string;
}

const BROKER_NAMES: Record<string, string> = {
  upstox: "Upstox",
  angelone: "AngelOne",
  zerodha: "Zerodha",
  dhan: "Dhan",
  groww: "Groww",
};

async function testUpstox(
  credentials: Record<string, string>
): Promise<BrokerTestResult> {
  const { access_token } = credentials;
  if (!access_token) {
    return { success: false, message: "Access token is required", brokerName: "Upstox" };
  }

  const res = await fetch("https://api.upstox.com/v2/user/profile", {
    headers: { Authorization: `Bearer ${access_token}`, Accept: "application/json" },
  });

  if (res.ok) {
    return { success: true, message: "Successfully connected to Upstox", brokerName: "Upstox" };
  }

  const body = await res.text();
  return { success: false, message: `Upstox returned ${res.status}: ${body}`, brokerName: "Upstox" };
}

async function testAngelOne(
  credentials: Record<string, string>
): Promise<BrokerTestResult> {
  const { api_key, client_id } = credentials;
  if (!api_key || !client_id) {
    return { success: false, message: "API Key and Client ID are required", brokerName: "AngelOne" };
  }

  const res = await fetch("https://apiconnect.angelbroking.com/rest/secure/angelbroking/user/v1/getProfile", {
    headers: {
      Authorization: `Bearer ${credentials.access_token ?? ""}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-UserType": "USER",
      "X-SourceID": "WEB",
      "X-ClientLocalIP": "",
      "X-ClientPublicIP": "",
      "X-MACAddress": "",
      "X-PrivateKey": api_key,
    },
  });

  if (res.ok) {
    return { success: true, message: "Successfully connected to AngelOne", brokerName: "AngelOne" };
  }

  const body = await res.text();
  return { success: false, message: `AngelOne returned ${res.status}: ${body}`, brokerName: "AngelOne" };
}

async function testZerodha(
  credentials: Record<string, string>
): Promise<BrokerTestResult> {
  const { api_key, access_token } = credentials;
  if (!api_key || !access_token) {
    return { success: false, message: "API Key and Access Token are required", brokerName: "Zerodha" };
  }

  const res = await fetch("https://api.kite.trade/user/profile", {
    headers: {
      Authorization: `token ${api_key}:${access_token}`,
      "X-Kite-Version": "3",
    },
  });

  if (res.ok) {
    return { success: true, message: "Successfully connected to Zerodha", brokerName: "Zerodha" };
  }

  const body = await res.text();
  return { success: false, message: `Zerodha returned ${res.status}: ${body}`, brokerName: "Zerodha" };
}

async function testDhan(
  credentials: Record<string, string>
): Promise<BrokerTestResult> {
  const { access_token, client_id } = credentials;
  if (!access_token || !client_id) {
    return { success: false, message: "Client ID and Access Token are required", brokerName: "Dhan" };
  }

  const res = await fetch("https://api.dhan.co/fundlimit", {
    headers: {
      "access-token": access_token,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });

  if (res.ok) {
    return { success: true, message: "Successfully connected to Dhan", brokerName: "Dhan" };
  }

  const body = await res.text();
  return { success: false, message: `Dhan returned ${res.status}: ${body}`, brokerName: "Dhan" };
}

async function testGroww(
  credentials: Record<string, string>
): Promise<BrokerTestResult> {
  const { access_token } = credentials;
  if (!access_token) {
    return { success: false, message: "Access token is required", brokerName: "Groww" };
  }

  // Groww API profile verification
  const res = await fetch("https://api.groww.in/v1/user/profile", {
    headers: {
      Authorization: `Bearer ${access_token}`,
      Accept: "application/json",
    },
  });

  if (res.ok) {
    return { success: true, message: "Successfully connected to Groww", brokerName: "Groww" };
  }

  const body = await res.text();
  return { success: false, message: `Groww returned ${res.status}: ${body}`, brokerName: "Groww" };
}

const testers: Record<
  string,
  (credentials: Record<string, string>) => Promise<BrokerTestResult>
> = {
  upstox: testUpstox,
  angelone: testAngelOne,
  zerodha: testZerodha,
  dhan: testDhan,
  groww: testGroww,
};

export async function POST(request: NextRequest) {
  try {
    const body: TestPayload = await request.json();
    const { brokerId, credentials } = body;

    if (!brokerId || !credentials) {
      return Response.json(
        {
          success: false,
          message: "brokerId and credentials are required",
          brokerName: brokerId ?? "Unknown",
        },
        { status: 400 }
      );
    }

    const tester = testers[brokerId];
    if (!tester) {
      return Response.json(
        {
          success: false,
          message: `Unsupported broker: ${brokerId}`,
          brokerName: BROKER_NAMES[brokerId] ?? brokerId,
        },
        { status: 400 }
      );
    }

    const result = await tester(credentials);
    return Response.json(result, { status: result.success ? 200 : 401 });
  } catch {
    return Response.json(
      {
        success: false,
        message: "Internal server error while testing connection",
        brokerName: "Unknown",
      },
      { status: 500 }
    );
  }
}
