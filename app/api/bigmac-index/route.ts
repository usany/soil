export async function GET() {
  try {
    const response = await fetch(
      "https://bigmacindex.app/data/countries.json",
      {
        cache: "no-store",
      },
    );
    const data = await response.json();

    // Find Korea's price
    const koreaData = data.find(
      (country: any) =>
        country.code === "KOR" || country.name === "South Korea",
    );
    const koreaPrice = koreaData?.price_usd || null;

    // Process data to include comparison with Korea
    const processedData = data.map((country: any) => ({
      ...country,
      compareToKorea: koreaPrice
        ? {
            price: country.price_usd,
            difference: country.price_usd - koreaPrice,
            percentDifference:
              ((country.price_usd - koreaPrice) / koreaPrice) * 100,
            isExpensive: country.price_usd > koreaPrice,
          }
        : null,
    }));

    return Response.json({
      success: true,
      koreaPrice,
      countries: processedData,
    });
  } catch (error) {
    console.error("Error fetching Big Mac Index:", error);
    return Response.json(
      { success: false, error: "Failed to fetch Big Mac Index data" },
      { status: 500 },
    );
  }
}
